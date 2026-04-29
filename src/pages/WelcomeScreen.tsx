import { Upload, Wand2 } from 'lucide-react'

interface Props {
  onLoadFile: () => void
  onStartWizard: () => void
  importError: string | null
}

export default function WelcomeScreen({ onLoadFile, onStartWizard, importError }: Props) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6">
      <div className="max-w-lg w-full text-center space-y-6">

        <div>
          <h1 className="text-3xl font-bold text-white">Retirement Income Planner</h1>
          <p className="text-gray-400 mt-2">
            Plan your drawdown strategy with confidence.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mt-8">

          <button
            onClick={onLoadFile}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-blue-500
                       rounded-xl p-6 text-left transition-colors"
          >
            <Upload className="w-8 h-8 text-blue-400 mb-3" />
            <h2 className="text-white font-semibold text-lg">Restore from file</h2>
            <p className="text-gray-400 text-sm mt-1">
              Load a previously exported .json config file.
            </p>
          </button>

          <button
            onClick={onStartWizard}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-emerald-500
                       rounded-xl p-6 text-left transition-colors"
          >
            <Wand2 className="w-8 h-8 text-emerald-400 mb-3" />
            <h2 className="text-white font-semibold text-lg">Set up from scratch</h2>
            <p className="text-gray-400 text-sm mt-1">
              Answer a few questions to build your plan.
            </p>
          </button>

        </div>

        {importError && (
          <p className="text-red-400 text-sm mt-2">{importError}</p>
        )}

      </div>
    </div>
  )
}
