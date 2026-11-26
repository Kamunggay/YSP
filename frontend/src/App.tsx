import { useEffect, useState } from 'react'
import './App.css'

type Connection = 'checking' | 'connected' | 'unavailable'

function App() {
  const [connection, setConnection] = useState<Connection>('checking')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function checkConnection() {
      setConnection('checking')

      try {
        const response = await fetch('/api/health', {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
          cache: 'no-store',
        })
        const result: unknown = await response.json()

        if (!controller.signal.aborted) {
          setConnection(
            response.ok && typeof result === 'object' && result !== null &&
            'database' in result && result.database === 'connected'
              ? 'connected'
              : 'unavailable',
          )
        }
      } catch {
        if (!controller.signal.aborted) setConnection('unavailable')
      }
    }

    void checkConnection()
    return () => controller.abort()
  }, [attempt])

  return (
    <main>
      <header>YSP <span>Development scaffold</span></header>
      <h1>A fresh starting point.</h1>
      <p>Check the connection from this page through Laravel to MySQL.</p>
      <section aria-label="Application connection">
        <p role="status" className={`connection ${connection}`}>
          {connection === 'checking' ? 'Checking connection?' :
            connection === 'connected' ? 'Laravel and MySQL are connected.' :
              'Connection unavailable. Check that the local services are running, then try again.'}
        </p>
        <button disabled={connection === 'checking'} onClick={() => setAttempt(value => value + 1)}>
          Check connection
        </button>
      </section>
    </main>
  )
}

export default App
