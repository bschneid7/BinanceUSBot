import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BotControlPanel from '@/components/control/BotControlPanel';
import PositionManager from '@/components/control/PositionManager';
import ManualTradePanel from '@/components/control/ManualTradePanel';

/**
 * Control Center - Unified interface for bot control, position management, and manual trading
 * Phase 1 Interactive Features
 */
export default function ControlCenter() {
  const [activeTab, setActiveTab] = useState('control');

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Control Center</h1>
          <p className="text-muted-foreground mt-1">
            Manage your trading bot, positions, and execute manual trades
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:w-[600px]">
          <TabsTrigger value="control" className="text-base">
            Bot Control
          </TabsTrigger>
          <TabsTrigger value="positions" className="text-base">
            Positions
          </TabsTrigger>
          <TabsTrigger value="manual" className="text-base">
            Manual Trade
          </TabsTrigger>
        </TabsList>

        <TabsContent value="control" className="space-y-6">
          <BotControlPanel />
        </TabsContent>

        <TabsContent value="positions" className="space-y-6">
          <PositionManager />
        </TabsContent>

        <TabsContent value="manual" className="space-y-6">
          <ManualTradePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

