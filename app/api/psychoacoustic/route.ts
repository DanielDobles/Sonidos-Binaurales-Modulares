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

    const systemInstruction = `Eres un sistema experto en neuroacústica avanzada, ingeniería de audio digital y programación de la Web Audio API. Tu tarea es diseñar un script de automatización paramétrica (LFO y curvas temporales) para inducir arrastre de ondas cerebrales basado en el diagnóstico físico/mental del usuario.

Aplica de forma estricta los siguientes rangos de frecuencia clínica cerebral:
- Épsilon: Menor a 0.5 Hz (Estados extraordinarios, meditación extrema)
- Delta: 0.5 Hz a 4 Hz (Sueño profundo, curación celular, regeneración)
- Theta: 4 Hz a 8 Hz (Meditación, creatividad, acceso al subconsciente, hipnagogia)
- Alfa: 8 Hz a 13 Hz (Relajación consciente, alerta tranquila, super-aprendizaje)
- Beta: 13 Hz a 30 Hz (Enfoque activo, procesamiento lógico, resolución de problemas)
- Gamma: 30 Hz a 100 Hz (Alto rendimiento cognitivo, consolidación de memoria, insight)
- HiperGamma/Lambda: 100 Hz a 200 Hz (Estados integrativos profundos, oscilación circular)

Genera una respuesta en JSON estructurado válido que defina los parámetros de un LFO sintético y rampas de automatización para que el frontend los ejecute con métodos nativos de la Web Audio API (setValueAtTime, linearRampToValueAtTime, setTargetAtTime). 

La sesión total dura 180 segundos dividida en 6 pasos secuenciales de 30 segundos. El desfase dinámico debe estar estrictamente acotado para evitar que la suma de (binauralBeatFrequency + beatLfoAmplitude) altere el rango espectral de la onda base seleccionada.

El usuario ha desactivado el ruido de fondo, por lo que el parámetro 'suggestedAmbient' debe ser obligatoriamente 'none'.
Toda la respuesta de texto debe redactarse en español técnico, elegante y con riguroso fundamento neurocientífico.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Diseña un programa binaural modular potente para: "${prompt}"`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sessionName: { type: Type.STRING, description: "Nombre de la sesión psicoacústica." },
            explanation: { type: Type.STRING, description: "Explicación cortical detallada y justificación científica." },
            baseCarrierFrequency: { type: Type.NUMBER, description: "Frecuencia portadora base en Hz (Recomendado: 100 a 250 Hz para evitar zonas de alta pendiente ISO 226)." },
            binauralBeatFrequency: { type: Type.NUMBER, description: "Frecuencia del pulso objetivo central en Hz (Debe corresponder exactamente al rango clínico elegido)." },
            autoModulationPattern: {
              type: Type.ARRAY,
              description: "Lista secuencial exacta de 6 fases de 30 segundos cada una.",
              items: {
                type: Type.OBJECT,
                properties: {
                  stepName: { type: Type.STRING, description: "Nombre técnico de la fase." },
                  carrierOffset: { type: Type.NUMBER, description: "Desplazamiento estático de la portadora en Hz (Rango: -10 a +10 Hz)." },
                  beatLfoAmplitude: { type: Type.NUMBER, description: "Amplitud máxima de la oscilación del pulso en Hz (Rango sutil: 0.1 a 0.5 Hz para evitar salir de la banda clínica)." },
                  beatLfoRate: { type: Type.NUMBER, description: "Frecuencia/Tasa del LFO que modula el pulso en Hz (Rango lento: 0.01 a 0.2 Hz para transiciones orgánicas)." },
                  rampDuration: { type: Type.NUMBER, description: "Tiempo en segundos destinado a la transición/suavizado inicial de la fase (Rango: 2.0 a 5.0 segundos)." }
                },
                required: ["stepName", "carrierOffset", "beatLfoAmplitude", "beatLfoRate", "rampDuration"]
              }
            },
            suggestedAmbient: { type: Type.STRING, description: "Debe devolver obligatoriamente 'none'." }
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
