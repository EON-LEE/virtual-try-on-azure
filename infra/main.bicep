targetScope = 'resourceGroup'

@description('Approved region for the app hosting environment; does not determine model availability.')
param location string = resourceGroup().location

@minLength(3)
@maxLength(32)
param appName string

@description('Publicly pullable, immutable container image reference built from this repository. No registry is created.')
param containerImage string

@secure()
@minLength(32)
param accessToken string

@description('Leave false until deployment, model, and inference cost approval is recorded.')
param enableInference bool = false

param sunburstEndpoint string = ''
param sunburstDeployment string = ''
param sunburstApiVersion string = '2025-04-01-preview'
@secure()
param sunburstApiKey string = ''

param maiEndpoint string = ''
param maiDeployment string = ''
@allowed([
  'MAI-Image-2.6'
])
param maiModel string = 'MAI-Image-2.6'
@secure()
param maiApiKey string = ''

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${appName}-environment'
  location: location
  properties: {}
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      secrets: concat([
        { name: 'studio-access-token', value: accessToken }
      ], empty(sunburstApiKey) ? [] : [
        { name: 'sunburst-key', value: sunburstApiKey }
      ], empty(maiApiKey) ? [] : [
        { name: 'mai-key', value: maiApiKey }
      ])
      ingress: {
        external: true
        allowInsecure: false
        targetPort: 3000
        transport: 'http'
      }
    }
    template: {
      containers: [
        {
          name: 'studio'
          image: containerImage
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'HOST', value: '0.0.0.0' }
            { name: 'PORT', value: '3000' }
            { name: 'APP_ORIGIN', value: 'https://${appName}.${environment.properties.defaultDomain}' }
            { name: 'APP_ACCESS_TOKEN', secretRef: 'studio-access-token' }
            { name: 'ENABLE_AZURE_INFERENCE', value: string(enableInference) }
            { name: 'AZURE_SUNBURST_ENDPOINT', value: sunburstEndpoint }
            { name: 'AZURE_SUNBURST_DEPLOYMENT', value: sunburstDeployment }
            { name: 'AZURE_SUNBURST_API_VERSION', value: sunburstApiVersion }
            empty(sunburstApiKey) ? { name: 'AZURE_SUNBURST_API_KEY', value: '' } : { name: 'AZURE_SUNBURST_API_KEY', secretRef: 'sunburst-key' }
            { name: 'AZURE_MAI_ENDPOINT', value: maiEndpoint }
            { name: 'AZURE_MAI_DEPLOYMENT', value: maiDeployment }
            { name: 'AZURE_MAI_MODEL', value: maiModel }
            empty(maiApiKey) ? { name: 'AZURE_MAI_API_KEY', value: '' } : { name: 'AZURE_MAI_API_KEY', secretRef: 'mai-key' }
          ]
          probes: [
            {
              type: 'Readiness'
              httpGet: { path: '/healthz', port: 3000 }
              initialDelaySeconds: 5
              periodSeconds: 10
            }
            {
              type: 'Liveness'
              httpGet: { path: '/healthz', port: 3000 }
              initialDelaySeconds: 15
              periodSeconds: 30
            }
          ]
        }
      ]
      // In-memory session ownership and job state require one replica/revision.
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
}

output studioUrl string = 'https://${app.properties.configuration.ingress.fqdn}'
