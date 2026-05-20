import { GoogleGenAI, Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

// Initialize the Google GenAI SDK with server secret and telemetry header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "El prompt es requerido y debe ser texto." }, { status: 400 });
    }

    const systemInstruction = `Eres un experto neurocientífico especializado en psicoacústica y terapia de ondas cerebrales. 
Tu tarea es diseñar un programa de tonos binaurales altamente efectivo y personalizado para el estado físico/mental descrito por el usuario.
Los estímulos binaurales funcionan presentando dos frecuencias ligeramente diferentes a cada oído, creando un tercer tono de pulso en el cerebro (la diferencia). 
Para evitar que el cerebro se adapte y pierda la sincronización hemisférica (efecto psicoacústico), sugerimos modulaciones micro-estructurales cada 30 segundos.

Genera una respuesta en JSON estructurado que contenga:
1. Nombre del programa personalizado.
2. Explicación neurocientífica detallada sobre por qué este patrón acústico es idóneo y cómo actuará en su cerebro.
3. Frecuencia portadora base recomendada en Hz (entre 100 Hz y 300 Hz, que son agradables e idóneas para inducir arrastre de frecuencias).
4. Frecuencia de pulso binaural base recomendada (entre 1 Hz y 45 Hz).
   - Ondas Delta (1-4 Hz): Sueño profundo, curación.
   - Ondas Theta (4-8 Hz): Meditación, creatividad, sueño ligero, hipnagogia.
   - Ondas Alfa (8-12 Hz): Relajación, super-aprendizaje, calma.
   - Ondas Beta (12-30 Hz): Enfoque, procesamiento de datos, resolución de problemas.
   - Ondas Gamma (30-45 Hz): Procesamiento cognitivo de alto nivel, flash de lucidez.
5. Un array de 6 fases secuenciales o pasos de micro-modulación (cada paso dura 30 segundos). Para cada paso, proporciona un desplazamiento de frecuencia portadora (ej. de -8 a +8Hz) y del pulso binaural (beatOffset). ADVERTENCIA IMPORTANTE: Genera desvíos muy sutiles en 'beatOffset' (ej. de -0.4 a +0.4 Hz) para asegurar que la frecuencia sumada (binauralBeatFrequency + beatOffset) permanezca perfectamente lockeada dentro del mismo rango clínico de la onda cerebral seleccionada sin salirse de su espectro base.
6. Fondo ambiental sugerido (por preferencia estricta del usuario, el ruido de fondo está desactivado, así que devuelve obligatoriamente "none" o "Ninguno").

Toda la respuesta debe redactarse en español elegante y con fundamentos científicos reales.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Diseña un programa binaural modular potente para: "${prompt}"`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sessionName: {
              type: Type.STRING,
              description: "Nombre de la sesión o del programa psicoacústico creado."
            },
            explanation: {
              type: Type.STRING,
              description: "Explicación científica detallada y empática sobre el beneficio cortical del programa."
            },
            baseCarrierFrequency: {
              type: Type.NUMBER,
              description: "Frecuencia portadora base en Hz, recomendada entre 100 y 300 Hz."
            },
            binauralBeatFrequency: {
              type: Type.NUMBER,
              description: "Frecuencia del pulso binaural objetivo en Hz, recomendada entre 1 y 45 Hz."
            },
            autoModulationPattern: {
              type: Type.ARRAY,
              description: "Lista de exactamente 6 variaciones micro-acústicas con un intervalo de 30 segundos cada una.",
              items: {
                type: Type.OBJECT,
                properties: {
                  stepName: {
                    type: Type.STRING,
                    description: "Nombre descriptivo de la sub-fase (ej. Descarga cortical, Estimulación alfa lenta, etc.)."
                  },
                  carrierOffset: {
                    type: Type.NUMBER,
                    description: "Desplazamiento en Hz de la frecuencia portadora en este paso (ej. de -10 a +10 Hz)."
                  },
                  beatOffset: {
                    type: Type.NUMBER,
                    description: "Desplazamiento en Hz de la frecuencia del pulso en este paso (ej. de -1 a +1 Hz)."
                  }
                },
                required: ["stepName", "carrierOffset", "beatOffset"]
              }
            },
            suggestedAmbient: {
              type: Type.STRING,
              description: "El tipo de sonido de fondo ideal para acompañar este estado."
            }
          },
          required: [
            "sessionName",
            "explanation",
            "baseCarrierFrequency",
            "binauralBeatFrequency",
            "autoModulationPattern",
            "suggestedAmbient"
          ]
        }
      }
    });

    const text = response.text;
    if (!text) {
      return NextResponse.json({ error: "No se recibió respuesta válida del modelo de IA." }, { status: 500 });
    }

    const data = JSON.parse(text.trim());
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error en la generación de programa psicoacústico:", error);
    return NextResponse.json({ error: error.message || "Error interno del servidor en la consulta psicoacústica." }, { status: 500 });
  }
}
