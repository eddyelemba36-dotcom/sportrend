import { BaseConnector } from "../base-connector";
import { ProviderHealth, ConnectionStatus } from "@odds-aggregator/shared";
import { OnexBetConnector } from "../onexbet/connector";

export class ConnectorRegistry {
  private connectors: Map<string, BaseConnector> = new Map();
  private static instance: ConnectorRegistry;

  static getInstance(): ConnectorRegistry {
    if (!ConnectorRegistry.instance) {
      ConnectorRegistry.instance = new ConnectorRegistry();
    }
    return ConnectorRegistry.instance;
  }

  register(name: string, connector: BaseConnector): void {
    this.connectors.set(name, connector);
    console.log(`[Registry] Registered connector: ${name}`);
  }

  unregister(name: string): void {
    const connector = this.connectors.get(name);
    if (connector) {
      connector.disconnect();
      this.connectors.delete(name);
      console.log(`[Registry] Unregistered connector: ${name}`);
    }
  }

  get(name: string): BaseConnector | undefined {
    return this.connectors.get(name);
  }

  getAll(): BaseConnector[] {
    return Array.from(this.connectors.values());
  }

  async startAll(): Promise<void> {
    for (const [, connector] of this.connectors) {
      try {
        await connector.connect();
      } catch (error: any) {
        console.error(`[Registry] Failed to start ${connector.name}: ${error.message}`);
      }
    }
  }

  async stopAll(): Promise<void> {
    for (const [, connector] of this.connectors) {
      try {
        await connector.disconnect();
      } catch (error: any) {
        console.error(`[Registry] Failed to stop ${connector.name}: ${error.message}`);
      }
    }
  }

  getHealth(): ProviderHealth[] {
    return this.getAll().map((c) => c.getHealth());
  }

  static initializeDefault(): ConnectorRegistry {
    const registry = ConnectorRegistry.getInstance();
    registry.register("1xbet", new OnexBetConnector());
    return registry;
  }
}
