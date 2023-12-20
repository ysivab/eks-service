import { Construct } from 'constructs';
import { EksCluster as Cluster } from 'eks-cluster';
import { aws_eks as eks } from 'aws-cdk-lib';
import { aws_ssm as ssm } from 'aws-cdk-lib';

export interface EksServiceStackProps {
  appName: string;
  cluster: Cluster;
  services: any
}

export class EksService extends Construct {
  constructor(scope: Construct, id: string, props: EksServiceStackProps) {
    super(scope, id);

    const appName = props.appName;
    const services = props.services;
    const eksCluster = props.cluster;

    const kubectlRoleArn = ssm.StringParameter.fromStringParameterAttributes(this, 'kubectlrolearn', {
      parameterName: `/eks/${appName}/KubectlRoleArn`
    });

    const cluster = eks.FargateCluster.fromClusterAttributes(this, 'eks-cluster', {
      clusterName: `${appName}`,
      kubectlRoleArn: kubectlRoleArn.stringValue
    })

    const manifests = [];

    const ingressRules = (services as [any]).map(e => {
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
      }
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
    (services as [any]).map(e => {
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
      })
    });


    // services
    (services as [any]).map(e => {
      manifests.push({
        apiVersion: "v1",
        kind: "Service",
        metadata: { name: `svc-${e.serviceName}` },
        spec: {
          type: "NodePort",
          ports: [{ port: 80, targetPort: e.containerPort, protocol: "TCP" }],
          selector: { app: e.serviceName }
        }
      })
    });

    // apply manifest to k8s
    new eks.KubernetesManifest(this, `${appName}`, {
      cluster,
      manifest: manifests
    });
  }
}