
'use server';

/**
 * @fileOverview A delivery route optimization AI agent.
 *
 * - optimizeDeliveryRoute - A function that handles the delivery route optimization process.
 * - OptimizeDeliveryRouteInput - The input type for the optimizeDeliveryRoute function.
 * - OptimizeDeliveryRouteOutput - The return type for the optimizeDeliveryRoute function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const OptimizeDeliveryRouteInputSchema = z.object({
  pizzeriaAddress: z.string().describe('O endereço da pizzaria.'),
  customerAddress: z.string().describe('O endereço de entrega do cliente.'),
});
export type OptimizeDeliveryRouteInput = z.infer<typeof OptimizeDeliveryRouteInputSchema>;

const OptimizeDeliveryRouteOutputSchema = z.object({
  optimizedRoute: z.string().url().describe('A URL do Google Maps para a rota de entrega otimizada da pizzaria para o cliente.'),
});
export type OptimizeDeliveryRouteOutput = z.infer<typeof OptimizeDeliveryRouteOutputSchema>;

export async function optimizeDeliveryRoute(input: OptimizeDeliveryRouteInput): Promise<OptimizeDeliveryRouteOutput> {
  return optimizeDeliveryRouteFlow(input);
}

const getRouteTool = ai.defineTool(
  {
    name: 'getGoogleMapsRouteUrl',
    description: 'Gera uma URL do Google Maps com a rota de um endereço de partida para um endereço de destino.',
    inputSchema: z.object({
      startAddress: z.string().describe('O endereço de partida para a rota.'),
      endAddress: z.string().describe('O endereço de destino para a rota.'),
    }),
    outputSchema: z.string().url().describe('A URL do Google Maps para a rota.'),
  },
  async (input) => {
    const origin = encodeURIComponent(input.startAddress);
    const destination = encodeURIComponent(input.endAddress);
    // Gera a URL do Google Maps Directions
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
  }
);

const prompt = ai.definePrompt({
  name: 'optimizeDeliveryRoutePrompt',
  input: {schema: OptimizeDeliveryRouteInputSchema},
  output: {schema: OptimizeDeliveryRouteOutputSchema},
  tools: [getRouteTool],
  prompt: `Você é um especialista em otimização de rotas para entrega de pizzas.

  Dado o endereço da pizzaria e o endereço do cliente, use a ferramenta getGoogleMapsRouteUrl para gerar a URL da rota otimizada no Google Maps.

Endereço da Pizzaria: {{{pizzeriaAddress}}}
Endereço do Cliente: {{{customerAddress}}}

Retorne a URL da rota otimizada.`,
});

const optimizeDeliveryRouteFlow = ai.defineFlow(
  {
    name: 'optimizeDeliveryRouteFlow',
    inputSchema: OptimizeDeliveryRouteInputSchema,
    outputSchema: OptimizeDeliveryRouteOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    // A IA deve chamar a ferramenta e preencher optimizedRoute diretamente
    // Se a IA falhar em chamar a ferramenta ou o output for inesperado, 
    // poderíamos adicionar uma lógica de fallback aqui, mas por enquanto confiamos na IA.
    if (!output || !output.optimizedRoute) {
      // Fallback manual caso a IA não use a ferramenta (improvável com o prompt atual)
      // No entanto, o design ideal é que a IA use a ferramenta para preencher o output.
      // A descrição do outputSchema já pede uma URL.
      const fallbackUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(input.pizzeriaAddress)}&destination=${encodeURIComponent(input.customerAddress)}&travelmode=driving`;
      return { optimizedRoute: fallbackUrl };
    }
    return output!;
  }
);
