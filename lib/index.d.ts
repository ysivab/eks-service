import { Construct } from 'constructs';
export interface EksServiceStackProps {
    appName: string;
    services: any;
}
export declare class EksService extends Construct {
    constructor(scope: Construct, id: string, props: EksServiceStackProps);
}
