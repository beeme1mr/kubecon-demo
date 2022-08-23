'use strict';

const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

registerInstrumentations({
  instrumentations: [getNodeAutoInstrumentations()],
});

const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');

const hostName = process.env.OTEL_TRACE_HOST || 'localhost';
const serviceName = process.env.SERVICE_NAME || 'unknown';
const environment = process.env.ENVIRONMENT || 'unknown';

const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: environment,
  }),
});

provider.addSpanProcessor(
  new BatchSpanProcessor(
    new JaegerExporter({
      endpoint: `http://${hostName}:14268/api/traces`,
    })
  )
);

provider.register();
