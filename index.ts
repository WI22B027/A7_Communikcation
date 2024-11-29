import * as pulumi from "@pulumi/pulumi";
import * as azure from"@pulumi/azure-native";

const location = "switzerlandnorth"
const resourceGroupName = "a7-python-webapp-rg";

//Resource Group
const resourceGroup = new azure.resources.ResourceGroup("a7resourcegroup",{
    location: location,
    resourceGroupName: resourceGroupName,
});

//Create App Service Plan
const appServicePlan = new azure.web.AppServicePlan("a7appServicePlan",{
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: {
        tier: "Free",
        name: "F1",
    },
    kind: "linux",
    reserved: true,
});

// Update AI Service to Disable Public Access
const aiService = new azure.cognitiveservices.Account("aiService", {
    accountName: "aiService1",
    resourceGroupName: resourceGroup.name,
    identity: {
        type: azure.cognitiveservices.ResourceIdentityType.SystemAssigned,
    },
    sku:
        {
            name: "F0" // Free tier
        },
    kind: "CognitiveServices",
    location: resourceGroup.location,
    properties: {
        publicNetworkAccess: "Disabled",
    },
});

//Create Virtual Network
const virtualNetwork = new azure.network.VirtualNetwork("vnet", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    addressSpace: { addressPrefixes: ["10.0.0.0/16"] },
    subnets: [
        {
            name: "webApp-subnet",
            addressPrefix: "10.0.1.0/24",
        },
        {
            name: "ai-service-subnet",
            addressPrefix: "10.0.2.0/24",
        },
    ],
});

//Create Private DNS Zone
const privateDnsZone = new azure.network.PrivateZone("a7PrivateDnsZone", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    privateZoneName: "privatelink.ai.azure.com",
});

// Link DNS Zone to Virtual Network
const vnetLink = new azure.network.VirtualNetworkLink("a7DnsZoneLink", {
    privateZoneName: privateDnsZone.name,
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    virtualNetwork: {
        id: virtualNetwork.id,
    },
});

// Create a Private Endpoint (required to associate with the Private DNS Zone Group)
const privateEndpoint = new azure.network.PrivateEndpoint("a7PrivateEndpoint", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    privateLinkServiceConnections: [{
        name: "aiServiceConnection",
        privateLinkServiceId: aiService.id,
    }],
});



//Create the Web app
const webApp = new azure.web.WebApp("a7webapp",{
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    serverFarmId: appServicePlan.id,
    httpsOnly: true,
    siteConfig: {
        linuxFxVersion: "PYTHON|3.9"
    },
});

const sourceControl = new azure.web.WebAppSourceControl("webAppContentOnGit", {
    name: webApp.name,
    resourceGroupName: resourceGroup.name,
    repoUrl: "https://github.com/WI22B027/clco-demo",
    branch: "main",
    isManualIntegration: false,
    isMercurial: false,
    isGitHubAction: true,
    deploymentRollbackEnabled: true,
    gitHubActionConfiguration: {
        codeConfiguration: {
            runtimeStack: "Python",
            runtimeVersion: "3.9",
        },
        generateWorkflowFile: true,
        isLinux: true,
    }

});

// Export the Web App's URL
export const webAppUrl = pulumi.interpolate`https://${webApp.defaultHostName}`;
