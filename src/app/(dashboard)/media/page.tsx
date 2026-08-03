import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";

function timeAgo(dateString: string) {
  const date = new Date(dateString);
  const diffInSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });
  
  const days = Math.round(diffInSeconds / 86400);
  if (Math.abs(days) > 0) return rtf.format(days, 'day');
  
  const hours = Math.round(diffInSeconds / 3600);
  if (Math.abs(hours) > 0) return rtf.format(hours, 'hour');
  
  const minutes = Math.round(diffInSeconds / 60);
  if (Math.abs(minutes) > 0) return rtf.format(minutes, 'minute');
  
  return rtf.format(diffInSeconds, 'second');
}

export default async function MediaPage() {
  const supabase = await createClient();
  const { data: assets } = await supabase
    .from("media_assets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Thư viện Media</h1>
      </div>
      
      {!assets || assets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <p>Chưa có file media nào.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {assets.map((asset) => (
            <Card key={asset.id} className="overflow-hidden group relative">
              <div className="aspect-square bg-muted">
                {asset.type === "image" ? (
                  <img
                    src={asset.url}
                    alt={asset.id}
                    className="object-cover w-full h-full"
                  />
                ) : asset.type === "video" ? (
                  <video
                    src={asset.url}
                    className="object-cover w-full h-full"
                    controls
                  />
                ) : (
                  <div className="flex items-center justify-center w-full h-full text-xs text-muted-foreground">
                    {asset.type}
                  </div>
                )}
              </div>
              <div className="p-2 text-xs truncate">
                <p className="font-medium truncate" title={asset.id}>{asset.id}</p>
                <p className="text-muted-foreground">
                  {timeAgo(asset.created_at)}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
