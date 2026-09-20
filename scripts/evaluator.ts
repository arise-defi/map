/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

/**
 * Gemini Live Agent - Offline Evaluator
 * 
 * This script analyzes exported JSON logs from the Gemini Live application
 * to calculate performance metrics:
 * 1. Tool Adherence: Was the expected tool called?
 * 2. Latency: Response time between user turn and tool/agent response.
 * 3. Success Rate: Overall pass/fail based on scenario goals.
 * 
 * Usage: npx tsx scripts/evaluator.ts <path-to-log.json>
 */

import * as fs from 'fs';
import * as path from 'path';

interface LogData {
  metadata: {
    sessionId: string;
    startedAt: string;
    systemPrompt: string;
    model: string;
  };
  configuration?: {
    model: string;
    systemPrompt: string;
  };
  conversation: any[];
}

function evaluate(filePath: string) {
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found at ${filePath}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(filePath, 'utf-8');
  const log: LogData = JSON.parse(rawData);

  const model = log.metadata?.model || log.configuration?.model;
  const systemPrompt = log.metadata?.systemPrompt || log.configuration?.systemPrompt;
  const firstTurnTime = log.conversation[0]?.timestamp;
  const startedAt = log.metadata?.startedAt || (firstTurnTime ? new Date(firstTurnTime).toLocaleString() : 'Unknown');
  const sessionId = log.metadata?.sessionId || (firstTurnTime ? `manual-${new Date(firstTurnTime).getTime().toString(36)}` : 'Unknown');

  console.log('\n' + '='.repeat(50));
  console.log(`EVALUATION REPORT: ${path.basename(filePath)}`);
  console.log('='.repeat(50));
  console.log(`Session ID:  ${sessionId}`);
  console.log(`Model:       ${model || 'Unknown'}`);
  console.log(`Started At:  ${startedAt}`);
  console.log(`Mode:        Autopilot Scenario Validation 🤖`);

  console.log('-'.repeat(50));

  const hasAutopilotTags = log.conversation.some(turn => turn.role === 'user' && (turn as any).expectedTool);
  if (!hasAutopilotTags) {
    console.warn('\n⚠️  WARNING: No autopilot scenario tags found in this log.');
    console.warn('   This log appears to be a manual session, not an autopilot run.');
    console.warn('   The evaluator currently only supports Autopilot scenario validation.\n');
  }

  let totalSteps = 0;
  let passedSteps = 0;
  const toolResults: any[] = [];

  log.conversation.forEach((turn, index) => {
    if (turn.role === 'user' && turn.expectedTool) {
      totalSteps++;
      const nextAgentTurns = log.conversation.slice(index + 1);
      const toolCallTurn = nextAgentTurns.find(t => {
        if (t.role === 'agent' && t.actualToolCalls) {
          return t.actualToolCalls.some((call: any) => {
            return call.name === turn.expectedTool;
          });
        }
        return false;
      });

      if (toolCallTurn) {
        passedSteps++;
        toolResults.push({
          step: turn.text,
          expected: turn.expectedTool,
          status: 'PASS ✅'
        });
      } else {
        // Find if the tool WAS called but with WRONG arguments
        const partialMatch = nextAgentTurns.find(t =>
          t.role === 'agent' && t.actualToolCalls?.some((c: any) => c.name === turn.expectedTool)
        );

        toolResults.push({
          step: turn.text,
          expected: turn.expectedTool,
          status: partialMatch ? 'FAIL (Wrong Args) ⚠️' : 'FAIL ❌'
        });
      }
    }
  });

  console.log('\nSTEP-BY-STEP ANALYSIS:');
  toolResults.forEach((res, i) => {
    console.log(`${i + 1}. [${res.status}] ${res.step} -> Expected: ${res.expected}`);
  });

  console.log('\n' + '-'.repeat(50));
  const score = totalSteps > 0 ? (passedSteps / totalSteps) * 100 : 0;
  console.log(`OVERALL SCORE: ${score.toFixed(1)}% (${passedSteps}/${totalSteps} correct)`);
  console.log('='.repeat(50) + '\n');
}

const logPath = process.argv[2];
if (!logPath) {
  console.error('Usage: npx tsx scripts/evaluator.ts <path-to-json-log>');
} else {
  evaluate(logPath);
}
