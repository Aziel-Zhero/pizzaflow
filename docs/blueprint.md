# **App Name**: PizzaFlow

## Core Features:

- Real-Time Order Display: Displays incoming pizza orders in real-time, with a waiting time indicator. 
- Order Management Dashboard: Provides separate interfaces for incoming and outgoing orders.
- Order Assignment: Adds a 'Take Order' button within the incoming order section to assign orders for preparation.
- AI Route Optimization: Suggests the optimal delivery route using the Google Maps API. It acts as a tool and presents the best route to the delivery person after an order is prepared.
- Order Tracking: Enables tracking of order status from preparation to delivery.  User has full control over logging of actions relating to order completion.
- Payment Details Logging: Records payments, providing options for different types of payment.
- Animated Text Transitions: Uses GSAP for animated text transitions. The library `gsap` and its dependencies `ScrollTrigger` and `SplitText` should be installed from `gsap/ScrollTrigger`.

## Style Guidelines:

- Primary color: Saturated red (#D32F2F), reminiscent of tomato sauce.
- Background color: Light desaturated red (#F2E7E7), providing a clean backdrop.
- Accent color: Burnt orange (#E67E22), complementing the red while adding warmth.
- Body and headline font: 'PT Sans' (sans-serif) for a modern and friendly appearance.
- Utilize Lucide icons for a consistent and modern visual language.
- Employ a clear, sectioned layout using Shadcn/UI components to differentiate incoming and outgoing orders.
- Integrate subtle GSAP animations on text elements to guide focus with refined transitions.