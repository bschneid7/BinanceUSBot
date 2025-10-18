import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

interface ConfigField {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'text';
  value: string | number | boolean;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
}

interface ConfigSectionProps {
  title: string;
  description?: string;
  fields: ConfigField[];
  onChange: (key: string, value: string | number | boolean) => void;
}

export function ConfigSection({ title, description, fields, onChange }: ConfigSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.map((field) => (
          <div key={field.key} className="flex items-center justify-between space-x-4">
            <div className="flex-1">
              <Label htmlFor={field.key} className="text-sm font-medium">
                {field.label}
              </Label>
              {field.description && <p className="text-xs text-muted-foreground mt-1">{field.description}</p>}
            </div>
            <div className="w-32">
              {field.type === 'boolean' ? (
                <Switch id={field.key} checked={field.value} onCheckedChange={(checked) => onChange(field.key, checked)} />
              ) : (
                <Input
                  id={field.key}
                  type={field.type}
                  value={field.value}
                  onChange={(e) => onChange(field.key, field.type === 'number' ? parseFloat(e.target.value) : e.target.value)}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  className="text-right"
                />
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}