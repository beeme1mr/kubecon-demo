import { OpenFeatureAPI } from './api';
import { GeneralError } from './errors';
import { NOOP_FEATURE_PROVIDER } from './noop-provider';
import {
  Client,
  Context,
  FeatureProvider,
  FlagEvaluationDetails,
  FlagEvaluationOptions,
  FlagValue,
  FlagValueType,
  Hook,
  HookContext,
  ProviderEvaluation,
  Reason,
} from './types';

type OpenFeatureClientOptions = {
  name?: string;
  version?: string;
};

export class OpenFeatureClient implements Client {
  readonly name?: string;
  readonly version?: string;

  private _hooks: Hook[] = [];

  constructor(
    private readonly api: OpenFeatureAPI,
    options: OpenFeatureClientOptions
  ) {
    this.name = options.name;
    this.version = options.version;
  }

  get hooks(): Hook[] {
    return this._hooks;
  }

  registerHooks(...hooks: Hook<FlagValue>[]): void {
    this._hooks = hooks;
  }

  async isEnabled(
    flagKey: string,
    defaultValue: boolean,
    context?: Context,
    options?: FlagEvaluationOptions
  ): Promise<boolean> {
    return (
      await this.evaluateFlag(
        'enabled',
        flagKey,
        defaultValue,
        context,
        options
      )
    ).value;
  }

  async getBooleanValue(
    flagKey: string,
    defaultValue: boolean,
    context?: Context,
    options?: FlagEvaluationOptions
  ): Promise<boolean> {
    return (
      await this.getBooleanDetails(flagKey, defaultValue, context, options)
    ).value;
  }

  getBooleanDetails(
    flagKey: string,
    defaultValue: boolean,
    // TODO make optional or required?
    context?: Context,
    options?: FlagEvaluationOptions
  ): Promise<FlagEvaluationDetails<boolean>> {
    return this.evaluateFlag(
      'boolean',
      flagKey,
      defaultValue,
      context,
      options
    );
  }

  async getStringValue(
    flagKey: string,
    defaultValue: string,
    context?: Context,
    options?: FlagEvaluationOptions
  ): Promise<string> {
    return (
      await this.getStringDetails(flagKey, defaultValue, context, options)
    ).value;
  }

  getStringDetails(
    flagKey: string,
    defaultValue: string,
    context?: Context,
    options?: FlagEvaluationOptions
  ): Promise<FlagEvaluationDetails<string>> {
    return this.evaluateFlag('string', flagKey, defaultValue, context, options);
  }

  async getNumberValue(
    flagKey: string,
    defaultValue: number,
    context?: Context,
    options?: FlagEvaluationOptions
  ): Promise<number> {
    return (
      await this.getNumberDetails(flagKey, defaultValue, context, options)
    ).value;
  }

  getNumberDetails(
    flagKey: string,
    defaultValue: number,
    context?: Context,
    options?: FlagEvaluationOptions
  ): Promise<FlagEvaluationDetails<number>> {
    return this.evaluateFlag('number', flagKey, defaultValue, context, options);
  }

  async getObjectValue<T extends object>(
    flagKey: string,
    defaultValue: T,
    context?: Context,
    options?: FlagEvaluationOptions
  ): Promise<T> {
    return (
      await this.getObjectDetails(flagKey, defaultValue, context, options)
    ).value;
  }

  getObjectDetails<T extends object>(
    flagKey: string,
    defaultValue: T,
    context?: Context,
    options?: FlagEvaluationOptions
  ): Promise<FlagEvaluationDetails<T>> {
    return this.evaluateFlag('json', flagKey, defaultValue, context, options);
  }

  private async evaluateFlag<T extends FlagValue>(
    flagValueType: FlagValueType,
    flagKey: string,
    defaultValue: T,
    context: Context | undefined,
    options?: FlagEvaluationOptions
  ): Promise<FlagEvaluationDetails<T>> {
    const provider = this.getProvider();
    const flagHooks = options?.hooks ?? [];
    const allHooks: Hook<FlagValue>[] = [
      ...OpenFeatureAPI.getInstance().hooks,
      ...this.hooks,
      ...flagHooks,
    ];
    context = context ?? {};
    let hookContext: HookContext = {
      flagKey,
      flagValueType,
      defaultValue,
      context,
      client: this,
      provider: this.getProvider(),
      executedHooks: {
        after: [],
        before: [],
        error: [],
        finally: [],
      },
    };
    let evaluationDetailsPromise: Promise<ProviderEvaluation<FlagValue>>;

    try {
      hookContext = this.beforeEvaluation(allHooks, hookContext);
      // TODO investigate why TS doesn't understand that this could be a
      // promise. Perhaps we should make it always return a promise.
      const transformedContext = await provider.contextTransformer(context);
      switch (flagValueType) {
        case 'enabled': {
          evaluationDetailsPromise = provider.isEnabledEvaluation(
            flagKey,
            defaultValue as boolean,
            transformedContext,
            options
          );
          break;
        }
        case 'boolean': {
          evaluationDetailsPromise = provider.getBooleanEvaluation(
            flagKey,
            defaultValue as boolean,
            transformedContext,
            options
          );
          break;
        }
        case 'string': {
          evaluationDetailsPromise = provider.getStringEvaluation(
            flagKey,
            defaultValue as string,
            transformedContext,
            options
          );
          break;
        }
        case 'number': {
          evaluationDetailsPromise = provider.getNumberEvaluation(
            flagKey,
            defaultValue as number,
            transformedContext,
            options
          );
          break;
        }
        case 'json': {
          evaluationDetailsPromise = provider.getObjectEvaluation(
            flagKey,
            defaultValue as object,
            transformedContext,
            options
          );
          break;
        }
        default: {
          throw new GeneralError('Unknown flag type');
        }
      }

      const evaluationDetails = await evaluationDetailsPromise;
      return {
        ...evaluationDetails,
        value: this.afterEvaluation(
          allHooks,
          hookContext,
          evaluationDetails
        ) as T,
        flagKey,
        executedHooks: hookContext.executedHooks,
      };
    } catch (err) {
      if (this.isError(err)) {
        this.errorEvaluation(allHooks, hookContext, err);
      }
      // TODO: error condition - conditional typing.
      return {
        flagKey,
        executedHooks: hookContext.executedHooks,
        value: defaultValue,
        reason: Reason.ERROR,
      };
    } finally {
      this.finallyEvaluation(allHooks, hookContext);
    }
  }

  private beforeEvaluation(
    allHooks: Hook[],
    hookContext: HookContext
  ): HookContext {
    const mergedContext = allHooks.reduce(
      (accumulated: Context, hook: Hook): Context => {
        if (typeof hook?.before === 'function') {
          hookContext.executedHooks.before.push(hook.name);
          return {
            ...accumulated,
            ...hook.before(hookContext),
          };
        }
        return accumulated;
      },
      hookContext.context
    );
    hookContext.context = mergedContext;
    return hookContext;
  }

  private afterEvaluation(
    allHooks: Hook[],
    hookContext: HookContext,
    evaluationDetails: ProviderEvaluation<FlagValue>
  ): FlagValue {
    return allHooks.reduce((accumulated: FlagValue, hook) => {
      if (typeof hook?.after === 'function') {
        hookContext.executedHooks.after.push(hook.name);
        return (
          hook.after(hookContext, {
            ...evaluationDetails,
            flagKey: hookContext.flagKey,
            executedHooks: hookContext.executedHooks,
          }) ?? accumulated
        );
      }
      return accumulated;
    }, evaluationDetails.value);
  }

  private finallyEvaluation(allHooks: Hook[], hookContext: HookContext): void {
    allHooks.forEach((hook) => {
      if (typeof hook?.finally === 'function') {
        hookContext.executedHooks.finally.push(hook.name);
        return hook.finally(hookContext);
      }
    });
  }

  private errorEvaluation(
    allHooks: Hook[],
    hookContext: HookContext,
    err: Error
  ): void {
    // Workaround for error scoping issue
    const error = err;
    allHooks.forEach((hook) => {
      if (typeof hook?.error === 'function') {
        hookContext.executedHooks.error.push(hook.name);
        return hook.error(hookContext, error);
      }
    });
  }

  private getProvider(): FeatureProvider {
    return this.api.getProvider() ?? NOOP_FEATURE_PROVIDER;
  }

  private isError(err: unknown): err is Error {
    return (
      (err as Error).stack !== undefined && (err as Error).message !== undefined
    );
  }
}
