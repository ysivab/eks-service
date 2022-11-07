"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EksService = void 0;
const constructs_1 = require("constructs");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_cdk_lib_2 = require("aws-cdk-lib");
class EksService extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const appName = props.appName;
        const services = props.services;
        const kubectlRoleArn = aws_cdk_lib_2.aws_ssm.StringParameter.fromStringParameterAttributes(this, 'kubectlrolearn', {
            parameterName: `/eks/${appName}/KubectlRoleArn`
        }).stringValue;
        const cluster = aws_cdk_lib_1.aws_eks.FargateCluster.fromClusterAttributes(this, 'eks-cluster', {
            clusterName: `${appName}`,
            kubectlRoleArn: kubectlRoleArn
        });
        const manifests = [];
        const ingressRules = services.map(e => {
            return {
                host: e.hostName ? e.hostName : undefined,
                http: {
                    paths: [
                        {
                            path: e.path ? e.path : "/",
                            pathType: "Prefix",
                            backend: {
                                service: {
                                    name: `svc-${e.serviceName}`,
                                    port: {
                                        number: 80
                                    }
                                }
                            }
                        }
                    ]
                }
            };
        });
        manifests.push({
            apiVersion: "networking.k8s.io/v1",
            kind: "Ingress",
            metadata: {
                name: `${appName}-ingress`,
                annotations: {
                    "alb.ingress.kubernetes.io/scheme": "internet-facing",
                    "alb.ingress.kubernetes.io/target-type": "ip"
                }
            },
            spec: {
                ingressClassName: "alb",
                rules: ingressRules
            }
        });
        // deployment
        services.map(e => {
            manifests.push({
                apiVersion: "apps/v1",
                kind: "Deployment",
                metadata: { name: e.serviceName },
                spec: {
                    replicas: e.desiredCount,
                    selector: { matchLabels: { app: e.serviceName } },
                    template: {
                        metadata: { labels: { app: e.serviceName } },
                        spec: {
                            containers: [
                                {
                                    name: e.containerName,
                                    image: e.imageUri,
                                    ports: [{ containerPort: e.containerPort }]
                                }
                            ]
                        }
                    }
                }
            });
        });
        // services
        services.map(e => {
            manifests.push({
                apiVersion: "v1",
                kind: "Service",
                metadata: { name: `svc-${e.serviceName}` },
                spec: {
                    type: "NodePort",
                    ports: [{ port: 80, targetPort: e.containerPort, protocol: "TCP" }],
                    selector: { app: e.serviceName }
                }
            });
        });
        // apply manifest to k8s
        new aws_cdk_lib_1.aws_eks.KubernetesManifest(this, `${appName}`, {
            cluster,
            manifest: manifests
        });
    }
}
exports.EksService = EksService;
