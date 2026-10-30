import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { STORAGE_KEY } from '../data/sample';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('СхемоГОСТ: ошибка интерфейса', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fatal-screen">
        <div className="fatal-card">
          <div className="fatal-icon">
            <AlertTriangle size={26} />
          </div>
          <h1>Не удалось открыть редактор</h1>
          <p>
            Похоже, в сохранённой схеме или в браузере что-то пошло не так.
            Перезагрузите страницу. Если ошибка повторяется — сбросьте
            локальные данные: схема хранится только в этом браузере.
          </p>
          <code>{this.state.error.message}</code>
          <div className="fatal-actions">
            <button
              className="button button-primary"
              onClick={() => window.location.reload()}
            >
              <RotateCcw size={16} />
              Перезагрузить
            </button>
            <button
              className="button button-ghost"
              onClick={() => {
                localStorage.removeItem(STORAGE_KEY);
                window.location.reload();
              }}
            >
              Сбросить локальные данные
            </button>
          </div>
        </div>
      </div>
    );
  }
}
