import { Module } from '@nestjs/common';

import { ConditionEvaluator } from './condition.evaluator';
import { DocumentCompiler } from './document.compiler';
import { FormulaEngine } from './formula.engine';
import { PackageResolver } from './package.resolver';
import { PricingCalculator } from './pricing.calculator';
import { ReusableBlockResolver } from './reusable-block.resolver';
import { TemplateSchemaValidator } from './template-schema.validator';
import { VariableResolver } from './variable.resolver';

/** map.md §44 — each engine service is independently testable and stateless. */
@Module({
  providers: [
    FormulaEngine,
    ConditionEvaluator,
    PricingCalculator,
    VariableResolver,
    TemplateSchemaValidator,
    PackageResolver,
    ReusableBlockResolver,
    DocumentCompiler,
  ],
  exports: [
    FormulaEngine,
    ConditionEvaluator,
    PricingCalculator,
    VariableResolver,
    TemplateSchemaValidator,
    PackageResolver,
    ReusableBlockResolver,
    DocumentCompiler,
  ],
})
export class TemplateEngineModule {}
