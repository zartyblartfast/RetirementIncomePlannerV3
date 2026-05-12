import assetModelJson from './data/asset_model.json';
import { suggestGrowthRates } from './growthSuggestions';
import type { AllocationConfig, DCPotConfig, PlannerConfig, TaxFreeAccountConfig } from './types';

export const DEFAULT_ALLOCATION_TEMPLATE_ID = 'default_like_diversified_growth';

export interface AssetClassOption {
  id: string;
  label: string;
}

export interface PortfolioTemplateOption {
  id: string;
  label: string;
  risk_score?: number;
}

interface AssetModelShape {
  asset_classes: AssetClassOption[];
  portfolio_templates: PortfolioTemplateOption[];
}

const assetModel = assetModelJson as unknown as AssetModelShape;

export function makeDefaultAllocation(): AllocationConfig {
  return {
    mode: 'template',
    template_id: DEFAULT_ALLOCATION_TEMPLATE_ID,
  };
}

export function getAssetClassOptions(): AssetClassOption[] {
  return assetModel.asset_classes.map((assetClass) => ({
    id: assetClass.id,
    label: assetClass.label,
  }));
}

export function getPortfolioTemplateOptions(): PortfolioTemplateOption[] {
  return assetModel.portfolio_templates.map((template) => ({
    id: template.id,
    label: template.label,
    risk_score: template.risk_score,
  }));
}

export function allocationTemplateLabel(templateId: string | undefined): string {
  if (!templateId) return 'Diversified Growth (default)';
  return getPortfolioTemplateOptions().find((template) => template.id === templateId)?.label ?? templateId;
}

export function normalizeAllocation(allocation: AllocationConfig | undefined): AllocationConfig {
  if (!allocation) return makeDefaultAllocation();

  if (allocation.mode === 'custom') {
    return {
      mode: 'custom',
      custom_weights: allocation.custom_weights ?? {},
      manual_override: allocation.manual_override ?? true,
    };
  }

  if (allocation.mode === 'template' && allocation.template_id) {
    return {
      mode: 'template',
      template_id: allocation.template_id,
      manual_override: allocation.manual_override,
    };
  }

  return makeDefaultAllocation();
}

export function defaultGrowthRateFromAllocation(allocation: AllocationConfig | undefined): number {
  return suggestGrowthRates({ allocation: normalizeAllocation(allocation) }).mid;
}

function isValidGrowthRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function normalizeConfigAssetAllocations(cfg: PlannerConfig): PlannerConfig {
  return {
    ...cfg,
    dc_pots: cfg.dc_pots.map((pot) => {
      const allocation = normalizeAllocation(pot.allocation);
      return {
        ...pot,
        allocation,
        growth_rate: isValidGrowthRate(pot.growth_rate)
          ? pot.growth_rate
          : defaultGrowthRateFromAllocation(allocation),
      };
    }),
    tax_free_accounts: cfg.tax_free_accounts.map((account) => {
      const allocation = normalizeAllocation(account.allocation);
      return {
        ...account,
        allocation,
        growth_rate: isValidGrowthRate(account.growth_rate)
          ? account.growth_rate
          : defaultGrowthRateFromAllocation(allocation),
      };
    }),
  };
}

export function allocationFromTemplate(templateId: string): AllocationConfig {
  return {
    mode: 'template',
    template_id: templateId,
    manual_override: true,
  };
}

export function customAllocationFromExisting(
  account: Pick<DCPotConfig | TaxFreeAccountConfig, 'allocation'>,
): AllocationConfig {
  const normalized = normalizeAllocation(account.allocation);
  if (normalized.mode === 'custom') return normalized;

  const template = getPortfolioTemplateWeights(normalized.template_id);

  return {
    mode: 'custom',
    custom_weights: template ?? { diversified_growth: 1 },
    manual_override: true,
  };
}

function getPortfolioTemplateWeights(templateId: string | undefined): Record<string, number> | undefined {
  if (!templateId) return undefined;
  const template = (assetModelJson as unknown as {
    portfolio_templates: Array<{ id: string; weights: Array<{ asset_class_id: string; weight: number }> }>;
  }).portfolio_templates.find((candidate) => candidate.id === templateId);

  if (!template) return undefined;

  return Object.fromEntries(
    template.weights.map((weight) => [weight.asset_class_id, weight.weight]),
  );
}

export function customWeightTotal(allocation: AllocationConfig | undefined): number {
  if (!allocation?.custom_weights) return 0;
  return Object.values(allocation.custom_weights).reduce((sum, weight) => sum + weight, 0);
}
