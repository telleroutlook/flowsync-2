const { Client } = require('pg');

async function checkAILogs() {
  const databaseUrl = process.env.DATABASE_URL || '';
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL env var.');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  console.log('Fetching recent AI request/response logs...\n');

  const logs = (
    await client.query(
      "select id, kind, payload, created_at from observability_logs where kind = 'ai_request' order by created_at desc limit 5"
    )
  ).rows;

  const responseLogs = (
    await client.query(
      "select id, kind, payload, created_at from observability_logs where kind = 'ai_response' order by created_at desc limit 5"
    )
  ).rows;

  const errorLogs = (
    await client.query(
      "select id, kind, payload, created_at from observability_logs where kind = 'error' order by created_at desc limit 10"
    )
  ).rows;

  console.log('=== AI REQUEST LOGS ===');
  for (const log of logs) {
    const payload = typeof log.payload === 'string' ? JSON.parse(log.payload) : log.payload;
    console.log(`Timestamp: ${new Date(Number(log.created_at)).toISOString()}`);
    console.log(`Request ID: ${payload.requestId || ''}`);
    console.log(`Message: ${payload.message?.substring(0, 100)}...`);
    console.log(`History Length: ${payload.history?.length || 0}`);
    console.log('---');
  }

  console.log('\n=== AI RESPONSE LOGS ===');
  for (const log of responseLogs) {
    const payload = typeof log.payload === 'string' ? JSON.parse(log.payload) : log.payload;
    console.log(`Timestamp: ${new Date(Number(log.created_at)).toISOString()}`);
    console.log(`Request ID: ${payload.requestId || ''}`);
    console.log(`Text: ${payload.text?.substring(0, 200)}...`);
    console.log(`Tool Calls: ${JSON.stringify(payload.toolCalls, null, 2)}`);
    console.log('---');
  }

  console.log('\n=== AI ERROR LOGS ===');
  for (const log of errorLogs) {
    const payload = typeof log.payload === 'string' ? JSON.parse(log.payload) : log.payload;
    console.log(`Timestamp: ${new Date(Number(log.created_at)).toISOString()}`);
    console.log(`Request ID: ${payload.requestId || ''}`);
    console.log(`Message: ${payload.message || ''}`);
    if (payload.detail) console.log(`Detail: ${payload.detail}`);
    if (payload.status) console.log(`Status: ${payload.status}`);
    if (payload.attempts) console.log(`Attempts: ${payload.attempts}`);
    if (payload.elapsedMs) console.log(`Elapsed: ${payload.elapsedMs}ms`);
    if (payload.lastErrorType) console.log(`Error Type: ${payload.lastErrorType}`);
    if (payload.retryHistory) {
      console.log(`Retry History: ${JSON.stringify(payload.retryHistory, null, 2)}`);
    }
    if (payload.baseUrl || payload.endpoint) {
      console.log(`Endpoint: ${payload.endpoint || ''}`);
      console.log(`Base URL: ${payload.baseUrl || ''}`);
    }
    console.log('---');
  }

  await client.end();
  process.exit(0);
}

checkAILogs().catch(console.error);
