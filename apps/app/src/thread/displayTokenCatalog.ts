import { getBuiltinModes } from '../constants/builtin';
import { getAllModels } from './composer/models';
import { opencodeSlash } from '../services/opencodeAdapter';
import { useAgentStore } from '../stores/agent';

export interface DisplayTokenCatalog {
  slashNames: Set<string>;
  agentNames: Set<string>;
  teamKeys: Set<string>;
  teamNames: Set<string>;
  modelIds: Set<string>;
  modelNames: Set<string>;
}

function canon(value: string): string {
  return value.trim().toLowerCase();
}

/** Catalog aligned with composer autocomplete menus (slash / @). */
export function buildDisplayTokenCatalog(): DisplayTokenCatalog {
  const slashNames = new Set<string>();
  for (const item of opencodeSlash.getCachedSlashCommands()) {
    if (item.name.trim()) slashNames.add(canon(item.name));
  }
  for (const mode of getBuiltinModes()) {
    if (mode.name.trim()) slashNames.add(canon(mode.name));
  }

  const agentNames = new Set<string>();
  const teamKeys = new Set<string>();
  const teamNames = new Set<string>();
  const { agents, teams } = useAgentStore.getState();
  for (const agent of agents) {
    if (agent.name.trim()) agentNames.add(canon(agent.name));
  }
  for (const team of teams) {
    if (team.key.trim()) teamKeys.add(canon(team.key));
    if (team.name.trim()) teamNames.add(canon(team.name));
  }

  const modelIds = new Set<string>();
  const modelNames = new Set<string>();
  for (const model of getAllModels()) {
    if (model.modelId.trim()) modelIds.add(canon(model.modelId));
    if (model.name.trim()) modelNames.add(canon(model.name));
  }

  return { slashNames, agentNames, teamKeys, teamNames, modelIds, modelNames };
}

export function isKnownSlashName(name: string, catalog: DisplayTokenCatalog): boolean {
  return catalog.slashNames.has(canon(name));
}

export function isKnownAgentName(name: string, catalog: DisplayTokenCatalog): boolean {
  return catalog.agentNames.has(canon(name));
}

export function isKnownTeamLabel(label: string, catalog: DisplayTokenCatalog): boolean {
  const key = canon(label);
  return catalog.teamKeys.has(key) || catalog.teamNames.has(key);
}

export function isKnownModelLabel(label: string, catalog: DisplayTokenCatalog): boolean {
  const key = canon(label);
  return catalog.modelIds.has(key) || catalog.modelNames.has(key);
}
