param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$Subscription,
    [switch]$ApprovedProvisioning
)

$ErrorActionPreference = 'Stop'
if (-not $ApprovedProvisioning) {
    throw 'Explicit approval for these two resources and deployments is required. No inference is included.'
}

$group = 'rg-virtual-try-on'
$owner = 'virtual-try-on'
$suffix = $Subscription.Replace('-', '').Substring(0, 8).ToLowerInvariant()
$models = @(
    @{
        name = "vto-sunburst-eus2-$suffix"
        region = 'eastus2'
        deployment = 'tryon-sunburst'
        model = 'gpt-image-2.5-sunburst'
        version = '2026-09-08'
        format = 'OpenAI'
    },
    @{
        name = "vto-mai26-eus-$suffix"
        region = 'eastus'
        deployment = 'tryon-mai26'
        model = 'MAI-Image-2.6'
        version = '2026-07-31'
        format = 'Microsoft'
    }
)

function Invoke-ScopedAzure([string]$Arguments) {
    $json = & wsl -d Ubuntu -- sh -lc "az $Arguments --subscription $Subscription --only-show-errors -o json"
    if ($LASTEXITCODE -ne 0) {
        throw 'Azure control-plane command failed. See provider error above; no automatic fallback.'
    }
    return ($json -join "`n" | ConvertFrom-Json)
}

$account = Invoke-ScopedAzure 'account show'
if ($account.id -ne $Subscription -or $account.state -ne 'Enabled') {
    throw 'Expected enabled, explicitly authorized subscription is unavailable.'
}

$groups = @(Invoke-ScopedAzure 'group list')
$existingGroup = $groups | Where-Object { $_.name -eq $group }
if ($existingGroup -and $existingGroup.tags.project -ne $owner) {
    throw 'Existing resource group is not owned by this experiment. Refusing reuse.'
}
if (-not $existingGroup) {
    $null = Invoke-ScopedAzure "group create --name $group --location eastus2 --tags project=$owner"
}

foreach ($spec in $models) {
    $accounts = @(Invoke-ScopedAzure "cognitiveservices account list --resource-group $group")
    $resource = $accounts | Where-Object { $_.name -eq $spec.name }
    if ($resource) {
        if ($resource.tags.project -ne $owner -or $resource.kind -ne 'AIServices' -or
            $resource.location -ne $spec.region -or $resource.sku.name -ne 'S0') {
            throw 'Existing account does not match the approved dedicated resource specification.'
        }
    }
    else {
        $null = Invoke-ScopedAzure (("cognitiveservices account create --name {0} --resource-group {1} " +
            "--kind AIServices --sku S0 --location {2} --custom-domain {0} " +
            "--allow-project-management false --tags project={3} --yes") -f
            $spec.name, $group, $spec.region, $owner)
    }

    $resource = Invoke-ScopedAzure "cognitiveservices account show --name $($spec.name) --resource-group $group"
    if ($resource.properties.provisioningState -ne 'Succeeded') {
        throw 'Dedicated AI resource provisioning did not succeed.'
    }
    $deployments = @(Invoke-ScopedAzure "cognitiveservices account deployment list --name $($spec.name) --resource-group $group")
    $deployment = $deployments | Where-Object { $_.name -eq $spec.deployment }
    if (-not $deployment) {
        $null = Invoke-ScopedAzure (("cognitiveservices account deployment create --name {0} --resource-group {1} " +
            "--deployment-name {2} --model-name {3} --model-version {4} --model-format {5} " +
            "--sku-name GlobalStandard --sku-capacity 1") -f
            $spec.name, $group, $spec.deployment, $spec.model, $spec.version, $spec.format)
    }
    $deployment = Invoke-ScopedAzure (("cognitiveservices account deployment show --name {0} " +
        "--resource-group {1} --deployment-name {2}") -f $spec.name, $group, $spec.deployment)
    if ($deployment.properties.provisioningState -ne 'Succeeded' -or
        $deployment.properties.model.name -ne $spec.model -or
        $deployment.properties.model.version -ne $spec.version -or
        $deployment.properties.model.format -ne $spec.format -or
        $deployment.sku.name -ne 'GlobalStandard' -or $deployment.sku.capacity -ne 1) {
        throw 'Deployment does not match the approved model, version, SKU, capacity, or state.'
    }
    $endpoint = if ($spec.format -eq 'OpenAI') {
        $resource.properties.endpoints.'Azure OpenAI Legacy API - Latest moniker'
    }
    else {
        $resource.properties.endpoints.'Azure MAI Model Inference API'
    }
    $expectedEndpoint = if ($spec.format -eq 'OpenAI') {
        "https://$($spec.name).openai.azure.com/"
    }
    else {
        "https://$($spec.name).services.ai.azure.com/"
    }
    if ($endpoint -ne $expectedEndpoint) {
        throw 'Provider did not publish the expected model-family service endpoint.'
    }
    [ordered]@{
        resource = $spec.name
        resourceGroup = $group
        region = $spec.region
        kind = $resource.kind
        accountSku = $resource.sku.name
        deployment = $spec.deployment
        model = $deployment.properties.model.name
        version = $deployment.properties.model.version
        format = $deployment.properties.model.format
        sku = $deployment.sku.name
        capacity = $deployment.sku.capacity
        state = $deployment.properties.provisioningState
        endpoint = $endpoint
        genericAccountEndpoint = $resource.properties.endpoint
        inferenceCalls = 0
    } | ConvertTo-Json
}
