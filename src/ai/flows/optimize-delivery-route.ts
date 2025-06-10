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
  pizzeriaAddress: z.string().describe('The address of the pizzeria.'),
  customerAddress: z.string().describe('The delivery address of the customer.'),
});
export type OptimizeDeliveryRouteInput = z.infer<typeof OptimizeDeliveryRouteInputSchema>;

const OptimizeDeliveryRouteOutputSchema = z.object({
  optimizedRoute: z.string().describe('The optimized delivery route from the pizzeria to the customer.'),
});
export type OptimizeDeliveryRouteOutput = z.infer<typeof OptimizeDeliveryRouteOutputSchema>;

export async function optimizeDeliveryRoute(input: OptimizeDeliveryRouteInput): Promise<OptimizeDeliveryRouteOutput> {
  return optimizeDeliveryRouteFlow(input);
}

const getRoute = ai.defineTool(
  {
    name: 'getRoute',
    description: 'Returns the best route from a starting address to a destination address using Google Maps API.',
    inputSchema: z.object({
      startAddress: z.string().describe('The starting address for the route.'),
      endAddress: z.string().describe('The destination address for the route.'),
    }),
    outputSchema: z.string(),
  },
  async (input) => {
    // TODO: Implement Google Maps API integration here to get the route
    // This is a placeholder; replace with actual API call.
    return `Optimized route from ${input.startAddress} to ${input.endAddress} using Google Maps API.`;
  }
);

const prompt = ai.definePrompt({
  name: 'optimizeDeliveryRoutePrompt',
  input: {schema: OptimizeDeliveryRouteInputSchema},
  output: {schema: OptimizeDeliveryRouteOutputSchema},
  tools: [getRoute],
  prompt: `You are a route optimization expert for pizza delivery.

  Given the pizzeria address and the customer address, use the getRoute tool to find the optimized route.

Pizzeria Address: {{{pizzeriaAddress}}}
Customer Address: {{{customerAddress}}}

Return the optimized route.`,
});

const optimizeDeliveryRouteFlow = ai.defineFlow(
  {
    name: 'optimizeDeliveryRouteFlow',
    inputSchema: OptimizeDeliveryRouteInputSchema,
    outputSchema: OptimizeDeliveryRouteOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
