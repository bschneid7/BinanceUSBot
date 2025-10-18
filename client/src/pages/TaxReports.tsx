import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TaxReportsTable } from '@/components/tax/TaxReportsTable';
import { getTaxReports } from '@/api/trading';
import { TaxReport } from '@/types/trading';
import { useToast } from '@/hooks/useToast';
import { FileText } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function TaxReports() {
  const [reports, setReports] = useState<TaxReport[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadReports = useCallback(async () => {
    try {
      const response = await getTaxReports();
      setReports(response.reports);
      setLoading(false);
    } catch (error: unknown) {
      console.error('Error loading tax reports:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load tax reports';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <FileText className="h-8 w-8" />
          Tax Reports
        </h1>
        <p className="text-muted-foreground">Monthly reconciliation and tax documents</p>
      </div>

      <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-900">
        <CardHeader>
          <CardTitle className="text-blue-900 dark:text-blue-100">Tax Compliance Information</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-800 dark:text-blue-200">
          <p className="mb-2">
            All reports use <strong>HIFO (Highest-In-First-Out)</strong> lot selection method via Specific Identification.
          </p>
          <p className="mb-2">Monthly reconciliation reports are automatically frozen and include:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Balance reconciliation (exchange vs ledger)</li>
            <li>Realized P&L calculation with lot-level tracking</li>
            <li>Fee allocation and reconciliation</li>
            <li>Immutable content hash for audit trail</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <TaxReportsTable reports={reports} />
        </CardContent>
      </Card>
    </div>
  );
}