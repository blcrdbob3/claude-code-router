import { IAgent } from './type';

export class AgentsManager {
    private agents: Map<string, IAgent> = new Map();

    registerAgent(agent: IAgent): void {
        this.agents.set(agent.name, agent);
    }

    getAgent(name: string): IAgent | undefined {
        return this.agents.get(name);
    }

    getAllAgents(): IAgent[] {
        return Array.from(this.agents.values());
    }

    getAllTools(): any[] {
        const allTools: any[] = [];
        for (const agent of this.agents.values()) {
            allTools.push(...agent.tools.values());
        }
        return allTools;
    }
}

const agentsManager = new AgentsManager();
export default agentsManager;
