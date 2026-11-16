import { GoogleGenAI, Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      rawText,
      sourceType,
      host,
      agent,
      repo,
      branch,
      existingProjects,
    } = body as {
      rawText?: string;
      sourceType?: 'session' | 'wispr' | 'project_recheck';
      host?: string;
      agent?: string;
      repo?: string;
      branch?: string;
      existingProjects?: { id: string; name: string; repos: string[] }[];
    };

    if (!rawText || typeof rawText !== 'string' || rawText.trim().length < 8) {
      return NextResponse.json(
        { error: 'Please provide transcript or dictation content (at least 8 characters).' },
        { status: 400 }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        {
          error:
            'GEMINI_API_KEY is not configured in the server environment. Configure it in Settings > Secrets.',
        },
        { status: 500 }
      );
    }

    const projectContext = (existingProjects ?? [])
      .map((p) => `- id: ${p.id} | name: "${p.name}" | repos: [${p.repos.join(', ')}]`)
      .join('\n');

    const prompt = [
      `Analyze this ${sourceType ?? 'session'} record captured on host "${host ?? 'Unknown'}" using "${agent ?? 'Unknown'}".`,
      repo ? `Repository: ${repo}` : '',
      branch ? `Branch: ${branch}` : '',
      '',
      'Existing Threadle projects (match by semantic intent, NEVER merge unrelated tasks solely because they share a repository):',
      projectContext || '(none)',
      '',
      'Source content:',
      rawText.slice(0, 12000),
      '',
      'Reconstruct the user actual intentions, explicit constraints, decisions/pivots, forgotten or unfinished requests, deliverable verification risk (did the agent claim completion without independent evidence?), and the single clearest next action.',
    ]
      .filter(Boolean)
      .join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'You are Threadle, an engineering workstream recovery analyzer. Distinguish intention from transcript chatter, never equate an agent claiming success with verified completion, and preserve uncertainty when evidence is absent.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            matchedProjectId: {
              type: Type.STRING,
              description:
                'ID of the best matching existing project, or "NEW_PROJECT" if this is a distinct workstream, or "AMBIGUOUS" if uncertain.',
            },
            attributionReason: {
              type: Type.STRING,
              description: 'Why this record maps to that project or remains ambiguous.',
            },
            title: {
              type: Type.STRING,
              description: 'Concise 4-8 word title for this work episode.',
            },
            userIntent: {
              type: Type.STRING,
              description: 'What the user actually wanted to achieve.',
            },
            whatHappened: {
              type: Type.STRING,
              description: 'Factual summary of actions taken so far.',
            },
            whatRemains: {
              type: Type.STRING,
              description: 'Concrete unfinished work, open questions, or missing verification.',
            },
            constraintsAndDecisions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Key constraints, rejected approaches, or directional pivots.',
            },
            forgottenOrUnfinishedItems: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Requests that were planned, promised, or left unverified.',
            },
            deliverableTitle: {
              type: Type.STRING,
              description: 'Primary expected deliverable.',
            },
            deliverableStatus: {
              type: Type.STRING,
              description:
                'One of: requested, implemented, pr_open, merged, verified, blocked, abandoned, unknown.',
            },
            discrepancyDetected: {
              type: Type.BOOLEAN,
              description: 'True if agent claimed completion without verification evidence.',
            },
            nextAction: {
              type: Type.STRING,
              description: 'Actionable next step to resume immediately.',
            },
          },
          required: [
            'matchedProjectId',
            'attributionReason',
            'title',
            'userIntent',
            'whatHappened',
            'whatRemains',
            'constraintsAndDecisions',
            'forgottenOrUnfinishedItems',
            'deliverableTitle',
            'deliverableStatus',
            'discrepancyDetected',
            'nextAction',
          ],
        },
      },
    });

    const jsonText = (response.text ?? '{}').trim();
    const parsed = JSON.parse(jsonText);
    return NextResponse.json({ analysis: parsed, model: 'gemini-4-hydrogen' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to analyze record.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
