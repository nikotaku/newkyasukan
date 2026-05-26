export const AnnouncementsList = () => {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3 px-2">
        <h2 className="text-sm font-bold tracking-wider">02（ゼロツー）</h2>
        <a
          href="https://m-sns.net/s/@zr_sendai2"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          サイトで開く ↗
        </a>
      </div>
      <div className="border border-border rounded-lg overflow-hidden bg-background">
        <iframe
          src="https://m-sns.net/s/@zr_sendai2"
          title="02 タイムライン"
          className="w-full"
          style={{ height: "600px", border: "none" }}
          loading="lazy"
        />
      </div>
    </div>
  );
};
