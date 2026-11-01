export { createEnvelope, InvalidEnvelopeError, validateEnvelope } from './envelope.js';
export type { Envelope, NewEnvelope } from './envelope.js';
export { RabbitConnection } from './connection.js';
export type { ConnectionOptions } from './connection.js';
export { RabbitPublisher } from './publisher.js';
export { RabbitConsumer } from './consumer.js';
export type { ConsumerOptions, HandlerContext, MessageDeduplicator, MessageHandler } from './consumer.js';
export {
  declareConsumerQueue,
  declareExchanges,
  EXCHANGE_DLX,
  EXCHANGE_EVENTOS,
  EXCHANGE_RETRY,
  EXCHANGE_SAGA,
  queueSpec,
  TOPOLOGY,
} from './topology.js';
export type { QueueSpec, RetryTier } from './topology.js';
export { MessagingModule, rabbitUrlFromEnv } from './messaging.module.js';
