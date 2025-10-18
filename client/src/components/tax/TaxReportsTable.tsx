import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TaxReport } from '@/types/trading';
import { Download, Lock } from 'lucide-react';
import { format } from 'date-fns';

interface TaxReportsTableProps {
  reports: TaxReport[];
}

export function TaxReportsTable({ reports }: TaxReportsTableProps) {
  const formatCurrency = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleDownload = (report: TaxReport) => {
    console.log('Downloading report:', report._id);
    // In real implementation, this would trigger a download
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Month</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Equity</TableHead>
            <TableHead>Realized P&L</TableHead>
            <TableHead>Fees Paid</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reports.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                No tax reports available
              </TableCell>
            </TableRow>
          ) : (
            reports.map((report) => (
              <TableRow key={report._id}>
                <TableCell className="font-medium">{report.month}</TableCell>
                <TableCell>{format(new Date(report.created_at), 'MMM dd, yyyy')}</TableCell>
                <TableCell>{formatCurrency(report.equity)}</TableCell>
                <TableCell className={report.realized_pnl >= 0 ? 'text-green-600' : 'text-red-600'}>{formatCurrency(report.realized_pnl)}</TableCell>
                <TableCell>{formatCurrency(report.fees_paid)}</TableCell>
                <TableCell>
                  {report.frozen ? (
                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      <Lock className="h-3 w-3 mr-1" />
                      Frozen
                    </Badge>
                  ) : (
                    <Badge variant="outline">Draft</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => handleDownload(report)} disabled={!report.pdf_url}>
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}