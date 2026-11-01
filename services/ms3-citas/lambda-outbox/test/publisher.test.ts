import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publishRecords, type RecordPublisher, type StreamRecord } from '../src/publisher.ts';

const record = (seq: string, id: string, eventName = 'INSERT'): StreamRecord => ({
  eventName,
  dynamodb: {
    SequenceNumber: seq,
    NewImage: {
      pk: { S: id },
      exchange: { S: 'sigec.eventos' },
      routingKey: { S: 'paciente.creado' },
      envelope: { S: JSON.stringify({ id, type: 'paciente.creado' }) },
    },
  },
});

class FakePublisher implements RecordPublisher {
  published: { exchange: string; routingKey: string; messageId: string }[] = [];
  constructor(private readonly failOn: string[] = []) {}
  async publish(exchange: string, routingKey: string, _body: string, messageId: string) {
    if (this.failOn.includes(messageId)) throw new Error('broker caido');
    this.published.push({ exchange, routingKey, messageId });
  }
}

test('publica los INSERT en orden con exchange y routingKey del item', async () => {
  const p = new FakePublisher();
  const res = await publishRecords([record('1', 'a'), record('2', 'b')], p);
  assert.deepEqual(res.batchItemFailures, []);
  assert.deepEqual(p.published.map((x) => x.messageId), ['a', 'b']);
  assert.equal(p.published[0].exchange, 'sigec.eventos');
  assert.equal(p.published[0].routingKey, 'paciente.creado');
});

test('ignora MODIFY y REMOVE', async () => {
  const p = new FakePublisher();
  const res = await publishRecords([record('1', 'a', 'MODIFY'), record('2', 'b', 'REMOVE'), record('3', 'c')], p);
  assert.deepEqual(res.batchItemFailures, []);
  assert.deepEqual(p.published.map((x) => x.messageId), ['c']);
});

test('ante un fallo informa ese registro y todos los siguientes (batchItemFailures) y no publica mas', async () => {
  const p = new FakePublisher(['b']);
  const res = await publishRecords([record('1', 'a'), record('2', 'b'), record('3', 'c'), record('4', 'd')], p);
  assert.deepEqual(res.batchItemFailures, [{ itemIdentifier: '2' }, { itemIdentifier: '3' }, { itemIdentifier: '4' }]);
  assert.deepEqual(p.published.map((x) => x.messageId), ['a']); // se conserva el orden: c y d esperan a b
});

test('un registro corrupto se informa como fallo', async () => {
  const bad: StreamRecord = { eventName: 'INSERT', dynamodb: { SequenceNumber: '9', NewImage: { pk: { S: 'x' }, envelope: { S: 'no es json' } } } };
  const res = await publishRecords([bad], new FakePublisher());
  assert.deepEqual(res.batchItemFailures, [{ itemIdentifier: '9' }]);
});
