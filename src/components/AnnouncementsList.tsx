export const AnnouncementsList = () => {
  return (
    <div className="mb-6 -mx-4 md:mx-0">
      <div className="flex items-center justify-between mb-2 px-4 md:px-2">
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
      <div className="bg-background overflow-hidden md:rounded-lg md:border md:border-border">
        <iframe
          src="https://m-sns.net/s/@zr_sendai2"
          title="02 タイムライン"
          className="w-full block"
          style={{ height: "calc(100vh - 200px)", minHeight: "500px", border: "none" }}
          loading="lazy"
        />
      </div>
    </div>
  );
};
