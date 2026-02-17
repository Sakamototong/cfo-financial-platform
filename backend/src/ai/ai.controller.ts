import { Body, Controller, Post } from '@nestjs/common';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('query')
  async query(@Body() body: { query: string }) {
    const q = body?.query || '';
    const text = await this.ai.query(q);
    return { answer: text };
  }
}
