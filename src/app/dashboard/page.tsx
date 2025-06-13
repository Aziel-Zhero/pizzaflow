
"use client";

import { useEffect, useState, useCallback } from 'react';
import AppHeader from '@/components/pizzaflow/AppHeader';
import type { DashboardAnalyticsData, OrderStatus, DeliveryPersonStat } from '@/lib/types';
import { getDashboardAnalytics, exportOrdersToCSV } from '@/app/actions';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Loader2, Package, DollarSign, ListChecks, TrendingUp, Download, ClockIcon, TicketIcon, RefreshCcw, Users, CalendarDays, Filter } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import { Badge } from '@/components/ui/badge';
import SplitText from '@/components/common/SplitText';
import { DatePickerWithRange, type DateRange } from '@/components/ui/date-picker-with-range'; // Import DatePickerWithRange
import { addDays, format, subDays } from "date-fns";


const PIZZERIA_NAME = "Pizzaria Planeta";
const AUTO_REFRESH_INTERVAL = 60000; // 60 segundos

const statusColorsForCharts: Record<OrderStatus, string> = {
  Pendente: "hsl(var(--chart-1))",
  EmPreparo: "hsl(var(--chart-2))", 
  AguardandoRetirada: "hsl(var(--chart-3))", 
  SaiuParaEntrega: "hsl(var(--chart-4))", 
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
  const [isExporting, setIsExporting] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29), // Default to last 30 days
    to: new Date(),
  });
  const { toast } = useToast();

  const fetchData = useCallback(async (showLoader = true, range?: DateRange) => {
    if (showLoader) setIsLoading(true);
    try {
      const period = range?.from && range?.to 
        ? { startDate: range.from, endDate: range.to } 
        : undefined;
      const data = await getDashboardAnalytics(period); 
      setAnalyticsData(data);
    } catch (error) {
      toast({ title: "Erro ao Carregar Dashboard", description: "Não foi possível buscar os dados de análise. Verifique o console.", variant: "destructive" });
      console.error("Failed to fetch analytics:", error);
      setAnalyticsData(null); 
    } finally {
      if (showLoader) setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData(true, dateRange); 
    const intervalId = setInterval(() => fetchData(false, dateRange), AUTO_REFRESH_INTERVAL); 
    return () => clearInterval(intervalId);
  }, [fetchData, dateRange]);

  const handleManualRefresh = () => {
    fetchData(true, dateRange); 
  };
  
  const handleDateRangeChange = (newRange: DateRange | undefined) => {
    setDateRange(newRange);
    // fetchData will be called by useEffect due to dateRange dependency change
  };


  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const csvData = await exportOrdersToCSV();
      if (csvData.startsWith("Nenhum pedido")) {
        toast({ title: "Exportar CSV", description: csvData, variant: "default" });
        return;
      }
      const blob = new Blob([`\uFEFF${csvData}`], { type: 'text/csv;charset=utf-8;' }); 
      const link = document.createElement("a");
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        const dateStamp = new Date().toISOString().split('T')[0];
        link.setAttribute("download", `pedidos_${PIZZERIA_NAME.toLowerCase().replace(/\s+/g, '_')}_${dateStamp}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast({ title: "Exportação Concluída", description: "O arquivo CSV dos pedidos foi baixado." });
      } else {
        toast({ title: "Exportar CSV", description: "Seu navegador não suporta download direto. Tente outro.", variant: "destructive" });
      }
    } catch (error) {
      console.error("Failed to export CSV:", error);
      toast({ title: "Erro na Exportação", description: "Não foi possível gerar o arquivo CSV.", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };


  if (isLoading && !analyticsData) { 
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
          <p className="text-center text-muted-foreground">Não foi possível carregar os dados de análise. Tente atualizar.</p>
           <div className="text-center mt-4">
            <Button onClick={handleManualRefresh} variant="outline" disabled={isLoading}>
              <RefreshCcw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar Dados
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const formatCurrency = (value: number | string | undefined): string => {
    const numericValue = Number(value); 
    const safeValue = isNaN(numericValue) ? 0 : numericValue;
    return `R$ ${safeValue.toFixed(2).replace('.', ',')}`;
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader appName={PIZZERIA_NAME} />
      <main className="flex-grow container mx-auto px-2 sm:px-4 py-6">
         <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
            <SplitText 
                text="Dashboard de Análises" 
                as="h1" 
                className="text-3xl font-headline font-bold text-primary"
                textAlign='left'
            />
            <div className="flex flex-wrap gap-2 items-center">
                <DatePickerWithRange date={dateRange} onDateChange={handleDateRangeChange} className="max-w-xs"/>
                <Button onClick={handleManualRefresh} variant="outline" size="sm" disabled={isLoading}>
                    <RefreshCcw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    {isLoading ? "Atualizando..." : "Atualizar"}
                </Button>
                <Button onClick={handleExportCSV} disabled={isExporting} variant="outline" size="sm">
                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    {isExporting ? "Exportando..." : "Exportar (CSV)"}
                </Button>
            </div>
         </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-8">
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
              <DollarSign className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(analyticsData.totalRevenue)}</div>
              <p className="text-xs text-muted-foreground">Receita de pedidos pagos no período</p>
            </CardContent>
          </Card>
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Pedidos</CardTitle>
              <Package className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analyticsData.totalOrders}</div>
              <p className="text-xs text-muted-foreground">Pedidos não cancelados no período</p>
            </CardContent>
          </Card>
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(analyticsData.averageOrderValue)}</div>
              <p className="text-xs text-muted-foreground">Valor médio por pedido no período</p>
            </CardContent>
          </Card>
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tempo Médio Entrega</CardTitle>
              <ClockIcon className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analyticsData.timeEstimates.averageTimeToDeliveryMinutes !== undefined 
                    ? `${analyticsData.timeEstimates.averageTimeToDeliveryMinutes} min` 
                    : "N/A"}
                </div>
              <p className="text-xs text-muted-foreground">Pedidos entregues no período</p>
            </CardContent>
          </Card>
           <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cupons Usados</CardTitle>
              <TicketIcon className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analyticsData.couponUsage?.totalCouponsUsed || 0}</div>
              <p className="text-xs text-muted-foreground">Desconto: {formatCurrency(analyticsData.couponUsage?.totalDiscountAmount)} (no período)</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="shadow-lg lg:col-span-2">
            <CardHeader>
              <CardTitle>Receita Diária</CardTitle>
              <CardDescription>Visualização da receita gerada por dia {dateRange?.from && dateRange.to ? `de ${format(dateRange.from, "dd/MM")} a ${format(dateRange.to, "dd/MM")}` : "(últimos 7 dias)"}.</CardDescription>
            </CardHeader>
            <CardContent className="h-[350px] w-full">
              {analyticsData.dailyRevenue.length > 0 ? (
                <ChartContainer config={chartConfigDailyRevenue} className="h-full w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analyticsData.dailyRevenue} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis tickFormatter={(value) => `R$${value}`} tickLine={false} axisLine={false} fontSize={12} width={70} />
                      <RechartsTooltip 
                        cursor={{ fill: 'hsl(var(--muted))' }}
                        content={<ChartTooltipContent indicator="dot" />}
                        formatter={(value: number) => [formatCurrency(value), "Receita"]}
                      />
                      <Bar dataKey="Receita" fill="var(--color-Receita)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              ) : (
                <p className="text-muted-foreground text-center py-10">Nenhuma receita no período selecionado para exibir.</p>
              )}
            </CardContent>
          </Card>
          
           <Card className="shadow-lg lg:col-span-1">
            <CardHeader>
              <CardTitle>Status dos Pedidos</CardTitle>
              <CardDescription>Distribuição dos pedidos por status no período.</CardDescription>
            </CardHeader>
            <CardContent className="h-[350px] w-full flex flex-col items-center justify-center">
              {analyticsData.ordersByStatus.reduce((sum, s) => sum + s.value, 0) > 0 ? (
                 <ChartContainer config={chartConfigOrderStatus} className="h-[250px] w-full aspect-square">
                   <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <RechartsTooltip 
                           cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                           content={<ChartTooltipContent hideLabel nameKey="name" />}
                        />
                        <Pie
                          data={analyticsData.ordersByStatus.filter(s => s.value > 0)} // Filter out zero-value statuses for cleaner chart
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80} 
                          innerRadius={30} 
                          labelLine={true} 
                          label={({ cx, cy, midAngle, outerRadius, percent, index, name, value }) => {
                            const RADIAN = Math.PI / 180;
                            const radius = outerRadius + 15; 
                            const x = cx + radius * Math.cos(-midAngle * RADIAN);
                            const y = cy + radius * Math.sin(-midAngle * RADIAN);
                            return (
                              <text
                                x={x}
                                y={y}
                                fill="hsl(var(--foreground))"
                                textAnchor={x > cx ? 'start' : 'end'}
                                dominantBaseline="central"
                                fontSize={11}
                              >
                                {`${name} (${value})`}
                              </text>
                            );
                          }}
                        >
                          {analyticsData.ordersByStatus.filter(s => s.value > 0).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} stroke={entry.fill} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                 </ChartContainer>
              ) : (
                 <p className="text-muted-foreground text-center py-10">Nenhum pedido no período selecionado para exibir a distribuição de status.</p>
              )}
               <div className="w-full mt-4 text-xs">
                {analyticsData.ordersByStatus.filter(s => s.value > 0).map(statusData => (
                  <div key={statusData.name} className="flex items-center justify-between py-0.5">
                    <div className="flex items-center">
                      <span className="h-2 w-2 rounded-full mr-2 shrink-0" style={{ backgroundColor: statusData.fill }} />
                      <span className="text-muted-foreground">{statusData.name}</span>
                    </div>
                    <Badge variant="outline" className="font-semibold">{statusData.value}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg col-span-1 lg:col-span-3">
            <CardHeader>
                <CardTitle className="flex items-center">
                    <Users className="mr-2 h-5 w-5 text-primary"/>
                    Desempenho dos Entregadores (Ativos)
                </CardTitle>
                <CardDescription>
                    Total de entregas concluídas no período selecionado.
                    <br/>
                    <span className="text-xs text-muted-foreground"> (Requer que a coluna 'delivery_person_id' na tabela 'orders' esteja corretamente migrada e populada para contagens precisas).</span>
                </CardDescription>
            </CardHeader>
            <CardContent>
                {analyticsData.deliveryPersonStats.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {analyticsData.deliveryPersonStats.map(person => (
                            <Card key={person.name} className="bg-card/50 p-4">
                                <CardTitle className="text-md">{person.name}</CardTitle>
                                <p className="text-xl font-bold text-primary">{person.deliveryCount}</p>
                                <p className="text-xs text-muted-foreground">entregas concluídas</p>
                            </Card>
                        ))}
                    </div>
                ) : (
                     <p className="text-muted-foreground text-center py-6">Nenhum entregador ativo ou nenhuma entrega registrada no período.</p>
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

