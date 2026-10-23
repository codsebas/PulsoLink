// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EditToggleActions } from '../src/components/admin/EditToggleActions';
import { ToggleEnabledDialog } from '../src/components/admin/ToggleEnabledDialog';
import { ApiClientError } from '../src/lib/api-client';

beforeEach(() => {
  // jsdom no implementa los algoritmos modales del <dialog> nativo.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true; });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.open = false; });
});
afterEach(cleanup);

describe('EditToggleActions', () => {
  it('ofrece editar y deshabilitar o habilitar según el estado', () => {
    const onEdit = vi.fn();
    const onToggle = vi.fn();
    const { rerender } = render(<EditToggleActions enabled onEdit={onEdit} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deshabilitar' }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onToggle).toHaveBeenCalledOnce();
    rerender(<EditToggleActions enabled={false} onEdit={onEdit} onToggle={onToggle} />);
    expect(screen.getByRole('button', { name: 'Habilitar' })).toBeTruthy();
  });
});

describe('ToggleEnabledDialog', () => {
  const renderDialog = (target: { id: string; enabled: boolean }, onConfirm: (t: typeof target) => Promise<unknown>, onClose = vi.fn()) => {
    render(
      <ToggleEnabledDialog
        target={target}
        noun="placa"
        disableMessage={<span>Mensaje de deshabilitar</span>}
        enableMessage={<span>Mensaje de habilitar</span>}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    return onClose;
  };

  it('deshabilita un registro habilitado y cierra al confirmar', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = renderDialog({ id: 'd1', enabled: true }, onConfirm);
    expect(screen.getByText('Deshabilitar placa')).toBeTruthy();
    expect(screen.getByText('Mensaje de deshabilitar')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Deshabilitar' })); });
    expect(onConfirm).toHaveBeenCalledWith({ id: 'd1', enabled: true });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('para un registro deshabilitado muestra el mensaje de habilitar', () => {
    renderDialog({ id: 'd2', enabled: false }, vi.fn());
    expect(screen.getByText('Habilitar placa')).toBeTruthy();
    expect(screen.getByText('Mensaje de habilitar')).toBeTruthy();
  });

  it('si la API falla, muestra el error y no cierra', async () => {
    const conflict = new ApiClientError({ code: 'ASSIGNMENT_IN_USE', message: 'En uso' }, 409);
    const onConfirm = vi.fn().mockRejectedValue(conflict);
    const onClose = renderDialog({ id: 'd1', enabled: true }, onConfirm);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Deshabilitar' })); });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/sesiones abiertas/);
  });
});
