import * as pulumi from "@pulumi/pulumi";
import * as azure from"@pulumi/azure-native";

const location = "northcentralus"
const resourceGroupName = "a7-python-webapp-rg2";

//Resource Group
const resourceGroup = new azure.resources.ResourceGroup("a7resourcegroup2",{
    location: location,
    resourceGroupName: resourceGroupName,
});


//Create App Service Plan
const appServicePlan = new azure.web.AppServicePlan("a7appServicePlan2",{
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: {
        tier: "Free",
        name: "F1",
    },
    kind: "linux",
    reserved: true,
});

//Create the Web app
const webApp = new azure.web.WebApp("a7webapp2",{
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
