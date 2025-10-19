import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ConfigSection } from '@/components/config/ConfigSection';
import { getBotConfig, updateBotConfig } from '@/api/trading';
import { BotConfig } from '@/types/trading';
import { useToast } from '@/hooks/useToast';
import { Settings, Save } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function Configuration() {
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const loadConfig = useCallback(async () => {
    try {
      const response = await getBotConfig();
      setConfig(response.config);
      setLoading(false);
    } catch (error: unknown) {
      console.error('Error loading config:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load configuration';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    try {
      await updateBotConfig(config);
      toast({
        title: 'Success',
        description: 'Configuration updated successfully'
      });
    } catch (error: unknown) {
      console.error('Error saving config:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save configuration';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleFieldChange = (section: keyof BotConfig, key: string, value: string | number | boolean) => {
    if (!config) return;
    setConfig({
      ...config,
      [section]: {
        ...config[section],
        [key]: value
      }
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!config) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="h-8 w-8" />
            Configuration
          </h1>
          <p className="text-muted-foreground">Bot settings and parameters</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      <ConfigSection
        title="Market Scanner"
        description="Market scanning and pair selection settings"
        fields={[
          { key: 'refresh_ms', label: 'Refresh Interval (ms)', type: 'number', value: config.scanner.refresh_ms, step: 100, min: 1000, max: 10000 },
          { key: 'min_volume_usd_24h', label: 'Min 24h Volume (USD)', type: 'number', value: config.scanner.min_volume_usd_24h, step: 100000, min: 500000, max: 10000000 },
          { key: 'max_spread_bps', label: 'Max Spread (bps)', type: 'number', value: config.scanner.max_spread_bps, step: 1, min: 1, max: 20 },
          { key: 'max_spread_bps_event', label: 'Max Spread Event (bps)', type: 'number', value: config.scanner.max_spread_bps_event, step: 1, min: 5, max: 30 },
          { key: 'tob_min_depth_usd', label: 'Min Order Book Depth (USD)', type: 'number', value: config.scanner.tob_min_depth_usd, step: 5000, min: 10000, max: 100000 },
          { key: 'pair_signal_cooldown_min', label: 'Signal Cooldown (min)', type: 'number', value: config.scanner.pair_signal_cooldown_min, step: 5, min: 5, max: 60 }
        ]}
        onChange={(key, value) => handleFieldChange('scanner', key, value)}
      />

      <ConfigSection
        title="Risk Management"
        description="Core risk parameters and limits"
        fields={[
          { key: 'R_pct', label: 'Risk per Trade (%)', type: 'number', value: config.risk.R_pct * 100, step: 0.1, min: 0.1, max: 2 },
          { key: 'daily_stop_R', label: 'Daily Loss Limit (R)', type: 'number', value: Math.abs(config.risk.daily_stop_R), step: 0.5, min: 1, max: 5 },
          { key: 'weekly_stop_R', label: 'Weekly Loss Limit (R)', type: 'number', value: Math.abs(config.risk.weekly_stop_R), step: 1, min: 3, max: 10 },
          { key: 'max_open_R', label: 'Max Open Risk (R)', type: 'number', value: config.risk.max_open_R, step: 0.5, min: 1, max: 5 },
          { key: 'max_exposure_pct', label: 'Max Exposure (%)', type: 'number', value: config.risk.max_exposure_pct * 100, step: 5, min: 30, max: 80 },
          { key: 'max_positions', label: 'Max Positions', type: 'number', value: config.risk.max_positions, step: 1, min: 1, max: 10 },
          { key: 'correlation_guard', label: 'Correlation Guard', type: 'boolean', value: config.risk.correlation_guard },
          { key: 'slippage_guard_bps', label: 'Slippage Guard (bps)', type: 'number', value: config.risk.slippage_guard_bps, step: 1, min: 1, max: 20 },
          { key: 'slippage_guard_bps_event', label: 'Slippage Guard Event (bps)', type: 'number', value: config.risk.slippage_guard_bps_event, step: 1, min: 5, max: 30 }
        ]}
        onChange={(key, value) => {
          let adjustedValue = value;
          if (key === 'R_pct' || key === 'max_exposure_pct') adjustedValue = (value as number) / 100;
          if (key === 'daily_stop_R' || key === 'weekly_stop_R') adjustedValue = -Math.abs(value as number);
          handleFieldChange('risk', key, adjustedValue);
        }}
      />

      <ConfigSection
        title="Reserve Management"
        description="Cash reserve targets and refill settings"
        fields={[
          { key: 'target_pct', label: 'Target Reserve (%)', type: 'number', value: config.reserve.target_pct * 100, step: 5, min: 10, max: 50 },
          { key: 'floor_pct', label: 'Floor Reserve (%)', type: 'number', value: config.reserve.floor_pct * 100, step: 5, min: 10, max: 40 },
          { key: 'refill_from_profits_pct', label: 'Refill from Profits (%)', type: 'number', value: config.reserve.refill_from_profits_pct * 100, step: 5, min: 10, max: 50 }
        ]}
        onChange={(key, value) => handleFieldChange('reserve', key, (value as number) / 100)}
      />

      <ConfigSection
        title="Playbook A: Breakout Trend"
        description="Breakout strategy parameters"
        fields={[
          { key: 'enable', label: 'Enable Playbook', type: 'boolean', value: config.playbook_A.enable },
          { key: 'volume_mult', label: 'Volume Multiplier', type: 'number', value: config.playbook_A.volume_mult, step: 0.1, min: 1, max: 3 },
          { key: 'stop_atr_mult', label: 'Stop ATR Multiplier', type: 'number', value: config.playbook_A.stop_atr_mult, step: 0.1, min: 0.5, max: 2 },
          { key: 'breakeven_R', label: 'Breakeven at (R)', type: 'number', value: config.playbook_A.breakeven_R, step: 0.5, min: 0.5, max: 2 },
          { key: 'scale_R', label: 'Scale at (R)', type: 'number', value: config.playbook_A.scale_R, step: 0.5, min: 1, max: 3 },
          { key: 'scale_pct', label: 'Scale Percentage', type: 'number', value: config.playbook_A.scale_pct * 100, step: 10, min: 25, max: 75 },
          { key: 'trail_atr_mult', label: 'Trail ATR Multiplier', type: 'number', value: config.playbook_A.trail_atr_mult, step: 0.1, min: 0.5, max: 2 }
        ]}
        onChange={(key, value) => {
          const adjustedValue = key === 'scale_pct' ? (value as number) / 100 : value;
          handleFieldChange('playbook_A', key, adjustedValue);
        }}
      />

      <ConfigSection
        title="Playbook B: VWAP Mean-Revert"
        description="VWAP fade strategy parameters"
        fields={[
          { key: 'enable', label: 'Enable Playbook', type: 'boolean', value: config.playbook_B.enable },
          { key: 'deviation_atr_mult', label: 'Deviation ATR Multiplier', type: 'number', value: config.playbook_B.deviation_atr_mult, step: 0.1, min: 1, max: 3 },
          { key: 'stop_atr_mult', label: 'Stop ATR Multiplier', type: 'number', value: config.playbook_B.stop_atr_mult, step: 0.1, min: 0.5, max: 1.5 },
          { key: 'time_stop_min', label: 'Time Stop (minutes)', type: 'number', value: config.playbook_B.time_stop_min, step: 15, min: 30, max: 180 },
          { key: 'target_R', label: 'Target (R)', type: 'number', value: config.playbook_B.target_R, step: 0.1, min: 0.5, max: 2 },
          { key: 'max_trades_per_session', label: 'Max Trades per Session', type: 'number', value: config.playbook_B.max_trades_per_session, step: 1, min: 1, max: 5 }
        ]}
        onChange={(key, value) => handleFieldChange('playbook_B', key, value)}
      />

      <ConfigSection
        title="Playbook C: Event Burst"
        description="Event-driven strategy parameters"
        fields={[
          { key: 'enable', label: 'Enable Playbook', type: 'boolean', value: config.playbook_C.enable },
          { key: 'event_window_min', label: 'Event Window (minutes)', type: 'number', value: config.playbook_C.event_window_min, step: 5, min: 15, max: 60 },
          { key: 'stop_atr_mult', label: 'Stop ATR Multiplier', type: 'number', value: config.playbook_C.stop_atr_mult, step: 0.1, min: 1, max: 3 },
          { key: 'scale_1_R', label: 'First Scale at (R)', type: 'number', value: config.playbook_C.scale_1_R, step: 0.5, min: 0.5, max: 2 },
          { key: 'scale_1_pct', label: 'First Scale %', type: 'number', value: config.playbook_C.scale_1_pct * 100, step: 5, min: 20, max: 50 },
          { key: 'scale_2_R', label: 'Second Scale at (R)', type: 'number', value: config.playbook_C.scale_2_R, step: 0.5, min: 1.5, max: 3 },
          { key: 'scale_2_pct', label: 'Second Scale %', type: 'number', value: config.playbook_C.scale_2_pct * 100, step: 5, min: 20, max: 50 },
          { key: 'trail_atr_mult', label: 'Trail ATR Multiplier', type: 'number', value: config.playbook_C.trail_atr_mult, step: 0.1, min: 0.5, max: 2 }
        ]}
        onChange={(key, value) => {
          const adjustedValue = key === 'scale_1_pct' || key === 'scale_2_pct' ? (value as number) / 100 : value;
          handleFieldChange('playbook_C', key, adjustedValue);
        }}
      />

      <ConfigSection
        title="Playbook D: Dip Pullback"
        description="Dip-buying strategy (uses reserve settings)"
        fields={[
          { key: 'enable', label: 'Enable Playbook', type: 'boolean', value: config.playbook_D.enable },
          { key: 'stop_atr_mult', label: 'Stop ATR Multiplier', type: 'number', value: config.playbook_D.stop_atr_mult, min: 0.5, max: 3.0, step: 0.1 },
        ]}
        onChange={(key, value) => handleFieldChange('playbook_D', key, value)}
      />
    </div>
  );
}