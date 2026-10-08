// One turn of the agent: the model decides which Relay tools to call, the MCP client calls them, and the loop ends
// when the model answers in words. Every step is reported through `emit`, which is what the simulator's
// "Inside the plan" panel shows.
const MAX_STEPS = 8;

export async function runTurn({ client, model, skill, conversation, text, emit = () => {} }) {
  const { tools } = await client.listTools();
  const views = Object.fromEntries(tools.map(tool => [tool.name, tool._meta?.ui?.resourceUri]).filter(([, uri]) => uri));
  conversation.messages.push({ role: 'user', text });
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const move = await model.next({ instructions: skill.instructions, tools, conversation });
    if (!move.calls?.length) {
      conversation.messages.push({ role: 'assistant', text: move.text });
      emit({ type: 'say', text: move.text });
      return move.text;
    }
    conversation.messages.push({ role: 'assistant', calls: move.calls, raw: move.raw });
    // Calls the model issued together are independent, so they run together.
    const results = await Promise.all(move.calls.map(async call => {
      const started = performance.now();
      emit({ type: 'call', id: call.id, name: call.name, args: call.args, together: move.calls.length });
      let result;
      try { result = await client.callTool({ name: call.name, arguments: call.args }); }
      catch (error) { result = { isError: true, content: [{ type: 'text', text: String(error.message ?? error) }] }; }
      const summary = result.content?.find(part => part.type === 'text')?.text ?? '';
      emit({ type: 'result', id: call.id, name: call.name, ms: Math.round(performance.now() - started), error: Boolean(result.isError), summary, data: result.structuredContent ?? null, view: result.isError ? null : views[call.name] ?? null });
      return { id: call.id, name: call.name, error: Boolean(result.isError), summary, data: result.structuredContent ?? null };
    }));
    conversation.messages.push({ role: 'tool', results });
  }
  const text2 = 'I could not finish that in a reasonable number of steps. Tell me which part matters most and I will start there.';
  conversation.messages.push({ role: 'assistant', text: text2 });
  emit({ type: 'say', text: text2 });
  return text2;
}

export const newConversation = () => ({ messages: [], notes: {} });
