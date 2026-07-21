import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

// POST /api/ai/handout
// Body: { templateId: string, petName: string, species: string, context?: string, customPrompt?: string, customTitle?: string }
// Returns: { title, content (markdown) }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { templateId, petName, species, context, customPrompt, customTitle } = body;

    const templates: Record<string, { title: string; prompt: string }> = {
      "elimination-rules": {
        title: "Strict Elimination Diet Rules",
        prompt:
          "Create a clear, owner-facing instruction sheet for a strict elimination diet trial. Cover: the 'nothing else by mouth' rule, which treats/flavored medications to avoid, what to do if the pet eats something else (log it), and how long the trial lasts. Use simple non-jargon language with short bullet points and a friendly but firm tone.",
      },
      "food-transition": {
        title: "Safe Transitioning to a New Food",
        prompt:
          "Create a step-by-step owner guide for transitioning a pet to a new food over 7 days. Include a daily mixing percentage table (old vs new food), what to do if the pet refuses food or develops loose stool, and special notes for cats (never fast a cat).",
      },
      "pruritus-diary": {
        title: "Pruritus & Lesion Monitoring Diary",
        prompt:
          "Create an instruction sheet teaching the owner how to track daily itching using a 1-10 scale, how to photograph lesions consistently (same lighting, angle, distance), and how to recognize and log flare triggers. Include a sample weekly diary table.",
      },
      "medication-admin": {
        title: "Medication Administration Guide",
        prompt:
          "Create tips for giving pills to dogs and cats: hiding in approved diet treats, pill pockets, when to use a pill gun, and what to do if the pet spits it out. Warn about giving medications with food during an elimination trial.",
      },
      "barf-safety": {
        title: "Raw Diet (BARF) Safety Guidelines",
        prompt:
          "Create hygiene and safety guidelines for owners feeding raw diets: safe thawing, sanitizing bowls and prep surfaces, hand washing, keeping raw food away from children and immunocompromised household members, and bacterial risk (Salmonella, E. coli). Include a daily handling checklist.",
      },
      "supplement-guide": {
        title: "Supplement Dosing & Safety Guide",
        prompt:
          "Create a guide for common veterinary supplements: omega-3 EPA/DHA (anti-inflammatory dose), probiotics, joint support (glucosamine/chondroitin), and vitamin E. Include approximate dosing by pet weight, timing (with food), and contraindications.",
      },
    };

    // Resolve template — either built-in or custom prompt
    let title: string;
    let prompt: string;
    if (templateId === "custom" && customPrompt) {
      title = customTitle || "Custom Handout";
      // Replace placeholders in the custom prompt
      prompt = customPrompt
        .replace(/\{\{petName\}\}/g, petName || "your pet")
        .replace(/\{\{species\}\}/g, species || "pet");
    } else {
      const template = templates[templateId];
      if (!template) {
        return NextResponse.json({ error: "Unknown template" }, { status: 400 });
      }
      title = template.title;
      prompt = template.prompt;
    }

    const zai = await ZAI.create();

    // Retry once after a short delay if rate-limited
    let completion;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        completion = await zai.chat.completions.create({
          messages: [
            {
              role: "assistant",
              content:
                "You are a veterinary assistant writing a professional, friendly client handout. Use Markdown formatting with a main title (##), section headings (###), bullet lists, and tables where helpful. Be specific, practical, and jargon-free. Address the owner directly. Keep it to roughly 250-400 words.",
            },
            {
              role: "user",
              content: `Pet: ${petName} (${species}).
${context ? `Additional context: ${context}` : ""}

Write a handout titled "${title}".
${prompt}`,
            },
          ],
          thinking: { type: "disabled" },
        });
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("429") && attempt < 2) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }

    const content = completion?.choices[0]?.message?.content ?? "";
    return NextResponse.json({ title, content });
  } catch (e) {
    console.error("Handout error:", e);
    const msg = e instanceof Error ? e.message : "Handout generation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
