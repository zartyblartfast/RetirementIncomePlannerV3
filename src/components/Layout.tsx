import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, GitCompareArrows, Target, ClipboardCheck } from 'lucide-react'
import { useConfig } from '../store/configStore'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/what-if', label: 'What If', icon: GitCompareArrows },
  { to: '/optimise', label: 'Optimise', icon: Target },
  { to: '/review', label: 'Review', icon: ClipboardCheck },
]

export default function Layout() {
  const { resetToDefault } = useConfig()

  function handleReset() {
    const confirmed = window.confirm(
      'This will clear all your settings and return to the welcome screen. Continue?'
    )
    if (confirmed) resetToDefault()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold tracking-tight">
                Retirement Planner
              </span>
            </div>
            <div className="flex items-center gap-1">
              {navItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </NavLink>
              ))}
              <button
                onClick={handleReset}
                className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                title="Reset all settings"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
      <footer className="text-center text-gray-400 text-xs py-4 mt-8">
        Retirement Income Planner V3 &copy; 2026
      </footer>
    </div>
  )
}
