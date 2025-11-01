export function Footer() {
  return (
    <footer className="fixed bottom-0 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t">
      <div className="container flex h-14 items-center justify-between">
        <p className="mx-6 text-sm text-muted-foreground">
          Designed by Bryan Schneider. Built by <a href="https://manus.im" target="_blank" rel="noopener noreferrer" className="hover:underline">Manus 1.5 Agent</a>
        </p>
      </div>
    </footer>
  )
}
