
"use client";

import { useEffect, useState } from 'react';
import AppHeader from '@/components/pizzaflow/AppHeader';
import type { DashboardAnalyticsData, DailyRevenue, OrdersByStatusData, OrderStatus } from '@/lib/types';
import { getDashboardAnalytics } from '@/app/actions';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, TooltipProps } from 'recharts';
import { Loader2, Package, DollarSign, ListChecks, TrendingUp, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import { Badge } from '@/components/ui/badge';
import SplitText from '@/components/common/SplitText';

const PIZZERIA_NAME = "Pizzaria Planeta";

const statusColorsForCharts: Record<OrderStatus, string> = {
  Pendente: "hsl(var(--chart-1))",
  "Em Preparo": "hsl(var(--chart-2))",
  "Aguardando Retirada": "hsl(var(--chart-3))",
  "Saiu para Entrega": "hsl(var(--chart-4))",
  Entregue: "hsl(var(--chart-5))",
  Cancelado: "hsl(var(--destructive))",
};


const chartConfigDailyRevenue: ChartConfig = {
  Receita: {
    label: "Receita (R$)",
    color: "hsl(var(--chart-1))",
  },
};

const chartConfigOrderStatus: ChartConfig = Object.fromEntries(
  (Object.keys(statusColorsForCharts) as OrderStatus[]).map(status => [
    status,
    { label: status, color: statusColorsForCharts[status] }
  ])
) as ChartConfig;


export default function AnalyticsDashboardPage() {
  const [analyticsData, setAnalyticsData] = useState<DashboardAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const data = await getDashboardAnalytics();
        setAnalyticsData(data);
      } catch (error) {
        toast({ title: "Erro", description: "Falha ao buscar dados de análise.", variant: "destructive" });
        console.error("Failed to fetch analytics:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [toast]);

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader appName={PIZZERIA_NAME} />
        <main className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
           <SplitText text="Carregando Análises..." as="p" className="ml-4 text-xl font-semibold" />
        </main>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader appName={PIZZERIA_NAME} />
        <main className="flex-grow container mx-auto px-4 py-8">
          <p className="text-center text-muted-foreground">Não foi possível carregar os dados de análise.</p>
        </main>
      </div>
    );
  }

  const formatCurrency = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader appName={PIZZERIA_NAME} />
      <main className="flex-grow container mx-auto px-2 sm:px-4 py-6">
         <SplitText 
            text="Dashboard de Análises" 
            as="h1" 
            className="text-3xl font-headline font-bold text-primary mb-8"
            textAlign='left'
          />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
              <DollarSign className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(analyticsData.totalRevenue)}</div>
              <p className="text-xs text-muted-foreground">Receita de todos os pedidos pagos</p>
            </CardContent>
          </Card>
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Pedidos</CardTitle>
              <Package className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analyticsData.totalOrders}</div>
              <p className="text-xs text-muted-foreground">Todos os pedidos não cancelados</p>
            </CardContent>
          </Card>
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(analyticsData.averageOrderValue)}</div>
              <p className="text-xs text-muted-foreground">Valor médio por pedido</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="shadow-lg col-span-1 lg:col-span-2">
            <CardHeader>
              <CardTitle>Receita Diária (Últimos 7 Dias)</CardTitle>
              <CardDescription>Visualização da receita gerada por dia.</CardDescription>
            </CardHeader>
            <CardContent className="h-[350px] w-full">
              <ChartContainer config={chartConfigDailyRevenue} className="h-full w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analyticsData.dailyRevenue} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickFormatter={(value) => `R$${value}`} tickLine={false} axisLine={false} fontSize={12} width={80} />
                    <RechartsTooltip 
                      cursor={{ fill: 'hsl(var(--muted))' }}
                      content={<ChartTooltipContent indicator="dot" />}
                      formatter={(value: number) => [formatCurrency(value), "Receita"]}
                    />
                    <Bar dataKey="Receita" fill="var(--color-Receita)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>
          
          <Card className="shadow-lg col-span-1 lg:col-span-1">
            <CardHeader>
              <CardTitle>Distribuição de Status dos Pedidos</CardTitle>
              <CardDescription>Como os pedidos estão distribuídos por status.</CardDescription>
            </CardHeader>
            <CardContent className="h-[350px] w-full flex items-center justify-center">
               <ChartContainer config={chartConfigOrderStatus} className="h-full w-full aspect-square">
                 <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <RechartsTooltip 
                         cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                         content={<ChartTooltipContent hideLabel nameKey="name" />}
                      />
                      <Pie
                        data={analyticsData.ordersByStatus}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={120}
                        innerRadius={50}
                        labelLine={false}
                        label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name }) => {
                          const RADIAN = Math.PI / 180;
                          const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                          const x = cx + (radius + 20) * Math.cos(-midAngle * RADIAN);
                          const y = cy + (radius + 20) * Math.sin(-midAngle * RADIAN);
                          return (
                            <text
                              x={x}
                              y={y}
                              fill="hsl(var(--foreground))"
                              textAnchor={x > cx ? 'start' : 'end'}
                              dominantBaseline="central"
                              fontSize={12}
                            >
                              {`${name} (${(percent * 100).toFixed(0)}%)`}
                            </text>
                          );
                        }}
                      >
                        {analyticsData.ordersByStatus.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
               </ChartContainer>
            </CardContent>
          </Card>

           <Card className="shadow-lg col-span-1 lg:col-span-1">
            <CardHeader>
              <CardTitle>Resumo dos Status</CardTitle>
               <CardDescription>Contagem de pedidos por cada status.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {analyticsData.ordersByStatus.map(statusData => (
                <div key={statusData.name} className="flex items-center justify-between">
                  <div className="flex items-center">
                    <span className="h-3 w-3 rounded-full mr-2" style={{ backgroundColor: statusData.fill }} />
                    <span className="text-sm text-muted-foreground">{statusData.name}</span>
                  </div>
                  <Badge variant="secondary" className="font-semibold">{statusData.value}</Badge>
                </div>
              ))}
              {analyticsData.ordersByStatus.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum pedido para exibir.</p>
              )}
            </CardContent>
          </Card>

        </div>
        <footer className="text-center py-6 border-t border-border text-sm text-muted-foreground mt-12">
          Pizza Planeta Flow &copy; {new Date().getFullYear()}
        </footer>
      </main>
    </div>
  );
}
