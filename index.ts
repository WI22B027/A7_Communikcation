import * as pulumi from "@pulumi/pulumi";
import * as azure from"@pulumi/azure-native";

const location = "westeurope"
const resourceGroupName = "a7-communication-rg";

//Resource Group
const resourceGroup = new azure.resources.ResourceGroup("a7resourcegroup-pulumi",{
    location: location,
    resourceGroupName: resourceGroupName,
});

//Create App Service Plan
const appServicePlan = new azure.web.AppServicePlan("a7appServicePlan",{
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: {
        tier: "Basic",
        name: "B1",
    },
    kind: "linux",
    reserved: true,
});

//Create Private DNS Zone
const privateDnsZone = new azure.network.PrivateZone("a7PrivateDnsZone", {
    resourceGroupName: resourceGroup.name,
    location: "Global",
    privateZoneName: "privatelink.cognitiveservices.azure.com",
});

//Create Virtual Network
const virtualNetwork = new azure.network.VirtualNetwork("vnet", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    addressSpace: { addressPrefixes: ["10.0.0.0/16"] },
});

const aiServiceSubnet = new azure.network.Subnet("aiServiceSubnet", {
    resourceGroupName: resourceGroup.name,
    virtualNetworkName: virtualNetwork.name,
    addressPrefix: "10.0.1.0/24",
    serviceEndpoints: [
        {
            service: "Microsoft.CognitiveServices", // Enable the Cognitive Services endpoint
        },
    ],
});

const webAppServiceSubnet = new azure.network.Subnet("webAppServiceSubnet", {
    resourceGroupName: resourceGroup.name,
    virtualNetworkName: virtualNetwork.name,
    addressPrefix: "10.0.2.0/24",
    delegations: [{
        name: "webAppDelegation",
        actions: ["Microsoft.Network/virtualNetworks/subnets/action"],
        serviceName: "Microsoft.Web/serverFarms",
    }],
});



// Link DNS Zone to Virtual Network
const dnsZoneLink = new azure.network.VirtualNetworkLink("a7DnsZoneLink", {
    privateZoneName: privateDnsZone.name,
    resourceGroupName: resourceGroup.name,
    location: "Global",
    registrationEnabled: false,
    virtualNetwork: {
        id: virtualNetwork.id,
    },
    virtualNetworkLinkName: "vnetlink1"
});

// Update AI Service to Disable Public Access
const aiService = new azure.cognitiveservices.Account("aiService", {
    resourceGroupName: resourceGroup.name,

    identity: {
        type: azure.cognitiveservices.ResourceIdentityType.SystemAssigned,
    },
    sku:
        {
            name: "S"
        },
    kind: "TextAnalytics",
    location: resourceGroup.location,
    properties: {
        publicNetworkAccess: "Disabled",
        networkAcls: {
            defaultAction: "Deny",
            virtualNetworkRules: [
                {
                    id: aiServiceSubnet.id,
                }
            ],
        },
        customSubDomainName: "a7-ai-custom-domain2",
    },
});



export const aiServiceKeys = azure.cognitiveservices.listAccountKeysOutput({
    accountName: aiService.name,
    resourceGroupName: resourceGroup.name,
})

const azKey = aiServiceKeys.key1?.apply(key => key || "");


// Create a Private Endpoint (required to associate with the Private DNS Zone Group)
const privateEndpoint = new azure.network.PrivateEndpoint("a7PrivateEndpoint", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    privateLinkServiceConnections: [{
        groupIds: ["account"],
        name: "aiServiceConnection",
        privateLinkServiceId: aiService.id,
    }],
    subnet: {
        id: aiServiceSubnet.id,
    },
});

//Create the Web app
const webApp = new azure.web.WebApp("a7webapp",{
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    serverFarmId: appServicePlan.id,
    httpsOnly: true,
    siteConfig: {
        linuxFxVersion: "PYTHON|3.9",
        appSettings: [{
            name: "AZ_ENDPOINT",
            value: "https://a7-ai-custom-domain2.cognitiveservices.azure.com/",
        },
        {
            name: "AZ_KEY",
            value: azKey,
        },
        {
            name: "SCM_DO_BUILD_DURING_DEPLOYMENT",
            value: "1",
        }],
    },
});

const vnetint = new azure.web.WebAppSwiftVirtualNetworkConnection("webAppVnetIntegration",{
    name: webApp.name,
    resourceGroupName: resourceGroup.name,
    subnetResourceId: webAppServiceSubnet.id,
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
// Recordset for DNS has to be set manual - would not work with pulumi


// Export the Web App's URL
export const webAppUrl = pulumi.interpolate`https://${webApp.defaultHostName}`;

