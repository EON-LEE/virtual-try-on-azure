targetScope = 'resourceGroup'

param location string = 'eastus'
@description('Approved capacity fallback for environment/app only; registry and identity stay eastus.')
param hostingLocation string = 'eastus2'
param environmentName string = 'vto-studio-b0af194e-environment-eus2'
param appName string = 'vto-studio-b0af194e'
param registryName string = 'vtostudiob0af194e'
param imageTag string = 'approved-build'
@description('First deploy foundation only, build the private image, then deploy with true.')
param deployApp bool = false
@secure()
@minLength(32)
param operatorToken string
@description('A separate generation approval is required; hosting deploy leaves false.')
param enableInference bool = false
@minValue(0)
@maxValue(100)
param maxModelAttempts int = 0
param inferenceExpiresAt string = ''

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${appName}-identity'
  location: location
}
resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}
resource pull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, identity.id, 'AcrPull')
  scope: registry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}
resource sunburst 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = {
  name: 'vto-sunburst-eus2-b0af194e'
}
resource mai 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = {
  name: 'vto-mai26-eus-b0af194e'
}
resource sunburstUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(sunburst.id, identity.id, 'OpenAIUser')
  scope: sunburst
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}
resource maiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(mai.id, identity.id, 'CognitiveServicesUser')
  scope: mai
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'a97b65f3-24c7-4388-baec-2e87135dc908')
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}
resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: environmentName
  location: hostingLocation
  properties: {}
}
resource app 'Microsoft.App/containerApps@2024-03-01' = if (deployApp) {
  name: appName
  location: hostingLocation
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      secrets: [
        { name: 'studio-operator-token', value: operatorToken }
      ]
      registries: [{ server: registry.properties.loginServer, identity: identity.id }]
      ingress: { external: true, allowInsecure: false, targetPort: 3000, transport: 'http' }
    }
    template: {
      containers: [
        {
          name: 'studio'
          image: '${registry.properties.loginServer}/try-on-studio:${imageTag}'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'HOST', value: '0.0.0.0' }
            { name: 'PORT', value: '3000' }
            { name: 'APP_ORIGIN', value: 'https://${appName}.${environment.properties.defaultDomain}' }
            { name: 'DEMO_OPERATOR_TOKEN', secretRef: 'studio-operator-token' }
            { name: 'ENABLE_AZURE_INFERENCE', value: enableInference ? 'true' : 'false' }
            { name: 'DEMO_MAX_MODEL_ATTEMPTS', value: string(maxModelAttempts) }
            { name: 'DEMO_INFERENCE_EXPIRES_AT', value: inferenceExpiresAt }
            { name: 'AZURE_AUTH_MODE', value: 'managed-identity' }
            { name: 'AZURE_TENANT_ID', value: tenant().tenantId }
            { name: 'AZURE_EXPECTED_PRINCIPAL_ID', value: identity.properties.principalId }
            { name: 'AZURE_MANAGED_IDENTITY_CLIENT_ID', value: identity.properties.clientId }
            { name: 'AZURE_SUNBURST_ENDPOINT', value: 'https://vto-sunburst-eus2-b0af194e.openai.azure.com' }
            { name: 'AZURE_SUNBURST_DEPLOYMENT', value: 'tryon-sunburst' }
            { name: 'AZURE_SUNBURST_API_VERSION', value: '2025-04-01-preview' }
            { name: 'AZURE_MAI_ENDPOINT', value: 'https://vto-mai26-eus-b0af194e.services.ai.azure.com' }
            { name: 'AZURE_MAI_DEPLOYMENT', value: 'tryon-mai26' }
            { name: 'AZURE_MAI_MODEL', value: 'MAI-Image-2.6' }
          ]
          probes: [
            { type: 'Readiness', httpGet: { path: '/healthz', port: 3000 }, initialDelaySeconds: 5, periodSeconds: 10 }
            { type: 'Liveness', httpGet: { path: '/healthz', port: 3000 }, initialDelaySeconds: 15, periodSeconds: 30 }
          ]
        }
      ]
      // Single process owns temporary sessions/jobs; scale-to-zero discards them.
      scale: { minReplicas: 0, maxReplicas: 1, rules: [{ name: 'http', http: { metadata: { concurrentRequests: '10' } } }] }
    }
  }
  dependsOn: [pull, sunburstUser, maiUser]
}
output registryLoginServer string = registry.properties.loginServer
output identityClientId string = identity.properties.clientId
output studioUrl string = deployApp ? 'https://${app!.properties.configuration.ingress.fqdn}' : ''
