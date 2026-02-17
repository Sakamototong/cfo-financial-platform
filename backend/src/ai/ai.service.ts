import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import { join } from 'path';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  async query(queryText: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY not set — using local mock');
    }

    // Load swagger doc and build a compact context (including parameters / summaries)
    let context = '';
    try {
      const docPath = join(process.cwd(), 'public', 'swagger-doc.json');
      const raw = fs.readFileSync(docPath, 'utf8');
      const doc = JSON.parse(raw);
      if (doc.paths) {
        context += 'API endpoints and parameters:\n';
        let total = 0;
        for (const [path, methods] of Object.entries(doc.paths)) {
          for (const [method, meta] of Object.entries(methods as any)) {
            const m = method.toUpperCase();
            const summary = (meta as any).summary || (meta as any).description || '';
            let line = `${m} ${path} - ${summary}`;
            // include parameters (name:type - description)
            if ((meta as any).parameters && Array.isArray((meta as any).parameters)) {
              const params = (meta as any).parameters
                .map((p: any) => `${p.name}:${p.schema?.type || p.type || 'any'}${p.required ? ' (required)' : ''}${p.description ? ' - ' + p.description : ''}`)
                .join('; ');
              if (params) line += ` | params: ${params}`;
            }
            // append if not too long
            if (total + line.length < 8000) {
              context += line + '\n';
              total += line.length;
            } else {
              // stop early to avoid huge prompts
              context += '...truncated...\n';
              break;
            }
          }
          if (context.includes('...truncated...')) break;
        }
      }
    } catch (e) {
      this.logger.warn('Could not load swagger-doc for context', e);
    }

    // If no OPENAI_API_KEY configured, provide a local mock answer using the generated context
    if (!apiKey) {
      try {
        const lines = context.split('\n').map(l => l.trim()).filter(Boolean);
        const q = queryText.toLowerCase();
        const tokens = q.split(/\W+/).filter(Boolean).slice(0, 12);
        const matches = lines.filter(l => tokens.some(t => t && l.toLowerCase().includes(t)));
        if (matches.length) {
          const top = matches.slice(0, 12).join('\n');
          return `Mock assistant (no OpenAI key). Found ${matches.length} matching lines:\n${top}`;
        }
        // fallback: return short context summary (first N lines)
        const summary = lines.slice(0, 12).join('\n');
        return `Mock assistant (no OpenAI key). No direct matches found. Context summary:\n${summary}`;
      } catch (e) {
        this.logger.error('Local mock failed', (e as any)?.message || e);
        return 'Local mock failed to produce an answer.';
      }
    }

    const system = `You are an assistant that answers questions about the CFO Platform HTTP API. Use the provided API endpoints context to point to relevant endpoints when answering. If the information is not present in the API, say so.`;
    const prompt = `${system}\n\nAPI_CONTEXT:\n${context}\n\nUser question:\n${queryText}`;

    try {
      const resp = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
          max_tokens: 600,
        },
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );

      const text = resp.data?.choices?.[0]?.message?.content;
      return text || 'No answer from OpenAI.';
    } catch (e: any) {
      this.logger.error('OpenAI request failed', (e as any)?.message || e);
      return `OpenAI request failed: ${(e as any)?.message || 'unknown error'}`;
    }
  }
}
