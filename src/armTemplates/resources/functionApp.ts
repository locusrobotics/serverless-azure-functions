import { dockerImages, FunctionAppOS, getFunctionWorkerRuntime, getRuntimeVersion, isNodeRuntime } from "../../config/runtime";
import { ArmParameter, ArmParameters, ArmParamType, ArmResourceTemplate, ArmResourceTemplateGenerator, DefaultArmParams } from "../../models/armTemplates";
import { FunctionAppConfig, ServerlessAzureConfig } from "../../models/serverless";
import { AzureNamingService, AzureNamingServiceOptions } from "../../services/namingService";

interface FunctionAppParams extends DefaultArmParams {
  /**
   * Name of function app
   */
  functionAppName: ArmParameter;
  /**
   * Node version of function app
   */
  functionAppNodeVersion: ArmParameter;
  /**
   * Kind of function app
   * `functionapp` for Windows function app
   * `functionapp,linux` for Linux function app
   */
  functionAppKind: ArmParameter;
  /**
   * Needs to be `true` for Linux function apps
   */
  functionAppReserved: ArmParameter;
  /**
   * Docker image for Linux function app
   */
  linuxFxVersion: ArmParameter;
  /**
   * Runtime language. Supported values: `node` and `python`
   */
  functionAppWorkerRuntime: ArmParameter;
  /**
   * Function app version. Default: `~3`
   */
  functionAppExtensionVersion: ArmParameter;
  /**
   * Name of App Insights resource
   */
  appInsightsName?: ArmParameter;
  /**
   * Indicates where function app code package is located
   * `1` (default value) if uploaded directly to function app
   * Could also be URL if running from external package
   */
  functionAppRunFromPackage?: ArmParameter;
  /**
   * Whether or not to enable remote build for linux consumption plans
   * Automatically installs NPM or PyPi packages during deployment
   */
  functionAppEnableRemoteBuild: ArmParameter;
  /**
   * Whether or not to enable or disable public network access to the
   * function app. Without this setting, null is the default, which
   * will determine Enabled/Disabled based on whether a private
   * endpoint is present to the function app
   */
  functionAppPublicNetworkAccess: ArmParameter;
  /**
   * Name of storage account used by function app
   */
  storageAccountName?: ArmParameter;
}

interface FunctionAppSetting {
  name: string;
  value: string;
}

export class FunctionAppResource implements ArmResourceTemplateGenerator {
  public static getResourceName(config: ServerlessAzureConfig) {
    const safeServiceName = config.service.replace(/\s/g, "-");
    const options: AzureNamingServiceOptions = {
      config,
      resourceConfig: config.provider.functionApp,
      suffix: safeServiceName,
      includeHash: false,
    }

    return AzureNamingService.getResourceName(options);
  }

  /*
   * Using "publicNetworkAccess": "Enabled", provides function app access restriction so that GitHub may deploy the
   * functions using SCM site when we have enabled a private endpoint for the function app. The default value is null,
   * which means it is conditional based on whether a private endpoint is present. It is better to provide "Enabled"
   * or "Disabled" for a more deliberate configuration.
   */
  public getTemplate(config: ServerlessAzureConfig): ArmResourceTemplate {
    return {
      "$schema": "https://schema.management.azure.com/schemas/2015-01-01/deploymentTemplate.json#",
      "contentVersion": "1.0.0.0",
      parameters: this.getTemplateParameters(),
      "variables": {},
      "resources": [
        {
          "type": "Microsoft.Web/sites",
          "apiVersion": "2022-09-01",
          name: "[parameters('functionAppName')]",
          "location": "[parameters('location')]",
          "identity": {
            "type": ArmParamType.SystemAssigned
          },
          "dependsOn": [
            "[resourceId('Microsoft.Storage/storageAccounts', parameters('storageAccountName'))]",
            "[concat('microsoft.insights/components/', parameters('appInsightsName'))]"
          ],
          "kind": "[parameters('functionAppKind')]",
          "properties": {
            "siteConfig": {
              appSettings: this.getFunctionAppSettings(config),
              "linuxFxVersion": "[parameters('linuxFxVersion')]",
              // Commenting temporarily for dev since it does not have a private endpoint
              // "ipSecurityRestrictionsDefaultAction": "Deny",
              // "scmIpSecurityRestrictionsDefaultAction": "Allow",
            },
            "reserved": "[parameters('functionAppReserved')]",
            // name: "[parameters('functionAppName')]",
            "clientAffinityEnabled": false,
            "publicNetworkAccess": "[parameters('functionAppPublicNetworkAccess')]",
            "hostingEnvironment": ""
          }
        }
      ]
    };
  }

  public getParameters(config: ServerlessAzureConfig): ArmParameters {
    const resourceConfig: FunctionAppConfig = {
      ...config.provider.functionApp,
    };
    const { runtime, os } = config.provider;
    const isLinuxRuntime = os === FunctionAppOS.LINUX;

    const params: FunctionAppParams = {
      functionAppName: {
        value: FunctionAppResource.getResourceName(config),
      },
      functionAppNodeVersion: {
        value: (isNodeRuntime(runtime))
          ?
          `~${getRuntimeVersion(runtime)}`
          :
          undefined,
      },
      functionAppRunFromPackage: {
        value: (isLinuxRuntime) ? "0" : "1",
      },
      functionAppKind: {
        value: (isLinuxRuntime) ? "functionapp,linux" : undefined,
      },
      functionAppReserved: {
        value: (isLinuxRuntime) ? true : undefined,
      },
      linuxFxVersion: {
        value: (isLinuxRuntime) ? this.getLinuxFxVersion(config) : undefined,
      },
      functionAppWorkerRuntime: {
        value: getFunctionWorkerRuntime(runtime),
      },
      functionAppExtensionVersion: {
        value: resourceConfig.extensionVersion,
      },
      functionAppPublicNetworkAccess: {
        value: (resourceConfig.publicNetworkAccess) ? resourceConfig.publicNetworkAccess : "Enabled",
      },
      functionAppEnableRemoteBuild: {
        value: isLinuxRuntime
      }
    };

    return params as unknown as ArmParameters;
  }

  private getTemplateParameters(): FunctionAppParams {
    return {
      functionAppRunFromPackage: {
        defaultValue: "1",
        type: ArmParamType.String
      },
      functionAppName: {
        defaultValue: "",
        type: ArmParamType.String
      },
      functionAppNodeVersion: {
        defaultValue: "",
        type: ArmParamType.String
      },
      functionAppKind: {
        defaultValue: "functionapp",
        type: ArmParamType.String,
      },
      functionAppReserved: {
        defaultValue: false,
        type: ArmParamType.Bool
      },
      linuxFxVersion: {
        defaultValue: "",
        type: ArmParamType.String,
      },
      functionAppWorkerRuntime: {
        defaultValue: "node",
        type: ArmParamType.String
      },
      functionAppExtensionVersion: {
        defaultValue: "~3",
        type: ArmParamType.String
      },
      functionAppEnableRemoteBuild: {
        defaultValue: false,
        type: ArmParamType.Bool
      },
      functionAppPublicNetworkAccess: {
        defaultValue: "Enabled",
        type: ArmParamType.String
      },
      storageAccountName: {
        defaultValue: "",
        type: ArmParamType.String
      },
      appInsightsName: {
        defaultValue: "",
        type: ArmParamType.String
      },
      location: {
        defaultValue: "",
        type: ArmParamType.String
      },
    }
  }

  private getFunctionAppSettings(config: ServerlessAzureConfig): FunctionAppSetting[] {
    const { appInsights } = config.provider;
    const instrumentationKey = appInsights ? appInsights.instrumentationKey : undefined;

    let appSettings: FunctionAppSetting[] = [
      {
        name: "FUNCTIONS_WORKER_RUNTIME",
        value: "[parameters('functionAppWorkerRuntime')]"
      },
      {
        name: "FUNCTIONS_EXTENSION_VERSION",
        value: "[parameters('functionAppExtensionVersion')]"
      },
      {
        name: "AzureWebJobsStorage",
        value: "[concat('DefaultEndpointsProtocol=https;AccountName=',parameters('storageAccountName'),';AccountKey=',listKeys(resourceId('Microsoft.Storage/storageAccounts', parameters('storageAccountName')), '2016-01-01').keys[0].value)]"
      },
      {
        name: "APPINSIGHTS_INSTRUMENTATIONKEY",
        value: instrumentationKey || "[reference(concat('microsoft.insights/components/', parameters('appInsightsName'))).InstrumentationKey]"
      }
    ];

    if (config.provider.os === FunctionAppOS.WINDOWS) {
      appSettings = appSettings.concat([
        {
          name: "WEBSITE_CONTENTAZUREFILECONNECTIONSTRING",
          value: "[concat('DefaultEndpointsProtocol=https;AccountName=',parameters('storageAccountName'),';AccountKey=',listKeys(resourceId('Microsoft.Storage/storageAccounts', parameters('storageAccountName')), '2016-01-01').keys[0].value)]"
        },
        {
          name: "WEBSITE_CONTENTSHARE",
          value: "[toLower(parameters('functionAppName'))]"
        },
        {
          name: "WEBSITE_RUN_FROM_PACKAGE",
          value: "[parameters('functionAppRunFromPackage')]"
        }
      ])
    }

    if (isNodeRuntime(config.provider.runtime)) {
      appSettings = appSettings.concat([
        {
          name: "WEBSITE_NODE_DEFAULT_VERSION",
          value: "[parameters('functionAppNodeVersion')]"
        }
      ])
    }

    return appSettings;
  }

  private getLinuxFxVersion(config: ServerlessAzureConfig): string {
    const { runtime } = config.provider;
    try {
      return dockerImages[config.provider.runtime]
    } catch (e) {
      throw new Error(`Runtime ${runtime} not currently supported by Linux Function Apps`);
    }
  }
}
