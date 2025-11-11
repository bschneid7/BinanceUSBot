import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { Sidebar } from './Sidebar';

export function Layout() {
  return (
    <div className="cmm-dashboard">
      <Header />
      <div className="flex h-[calc(100vh-4rem)] pt-16">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="cmm-content">
            <Outlet />
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}