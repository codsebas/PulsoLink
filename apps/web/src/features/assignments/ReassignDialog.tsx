import React, { useState } from 'react';
import { FormDialog } from '../../components/admin/FormDialog';
import { SelectField } from '../../components/admin/FormFields';
import { OptionPagination } from '../../components/admin/OptionPagination';
import { formatApiError } from '../../components/admin/api-error';
import type { CatalogOptions } from '../catalog/useCatalogOptions';
import { useAssignments, useCloseAssignment, useCreateAssignment } from './api';

interface ReassignDialogProps {
  catalog: CatalogOptions;
  onClose: () => void;
}

/**
 * Reasignación guiada: cierra la asignación activa del paciente y crea la nueva.
 * Las asignaciones activas se consultan aparte, sin depender de los filtros ni
 * de la paginación de la tabla (revisión del PR #38). Se monta solo mientras
 * está abierto.
 */
export const ReassignDialog: React.FC<ReassignDialogProps> = ({ catalog, onClose }) => {
  const [patientId, setPatientId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [step, setStep] = useState<'idle' | 'closing' | 'creating'>('idle');
  const [partialFailure, setPartialFailure] = useState(false);
  const createMutation = useCreateAssignment();
  const closeMutation = useCloseAssignment();

  const activeForPatientQuery = useAssignments({ patientId, status: 'active' }, { enabled: Boolean(patientId) });
  const activeForDeviceQuery = useAssignments({ deviceId, status: 'active' }, { enabled: Boolean(deviceId) });

  // Origen de verdad propio del diálogo: primera página del filtro activo del paciente.
  const activeForPatient = activeForPatientQuery.data?.pages[0]?.data[0];
  const lookupLoading = activeForPatientQuery.isLoading || (Boolean(deviceId) && activeForDeviceQuery.isLoading);
  // Asignación activa que ya usa la placa elegida; si es de otro paciente, no se puede crear la nueva.
  const deviceActiveAssignment = activeForDeviceQuery.data?.pages[0]?.data[0];
  const deviceOccupiedByOther = Boolean(deviceActiveAssignment) && deviceActiveAssignment?.patientId !== patientId;
  const lookupError = activeForPatientQuery.error ?? activeForDeviceQuery.error;
  const sameDevice = Boolean(deviceId) && activeForPatient?.deviceId === deviceId;
  const blocked = lookupLoading || Boolean(lookupError) || deviceOccupiedByOther || sameDevice;
  const busy = step !== 'idle' || createMutation.isPending || closeMutation.isPending;

  const handleReassign = async () => {
    if (!patientId || !deviceId || blocked) return;
    createMutation.reset();
    closeMutation.reset();
    setPartialFailure(false);
    let closedPrevious = false;
    try {
      if (activeForPatient) {
        setStep('closing');
        await closeMutation.mutateAsync(activeForPatient.id);
        closedPrevious = true;
      }
      setStep('creating');
      await createMutation.mutateAsync({ patientId, deviceId });
      onClose();
    } catch {
      // El cierre no es atómico con la creación: si ya se cerró, avisar que la
      // paciente queda sin asignación activa (revisión del PR #38).
      setPartialFailure(closedPrevious);
    } finally {
      setStep('idle');
    }
  };

  return (
    <FormDialog
      open
      title="Reasignar placa"
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        void handleReassign();
      }}
      submitLabel="Reasignar"
      isSubmitting={busy}
      error={createMutation.error ?? closeMutation.error}
      footer={
        <button
          type="submit"
          disabled={blocked || busy}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
        >
          {lookupLoading
            ? 'Consultando asignaciones…'
            : step === 'closing'
              ? 'Cerrando asignación…'
              : step === 'creating'
                ? 'Creando asignación…'
                : 'Reasignar'}
        </button>
      }
    >
      <OptionPagination label="pacientes" query={catalog.patientsQuery} />
      <OptionPagination label="placas" query={catalog.devicesQuery} />
      {lookupError ? <div role="alert" className="text-sm text-rose-800">
        {formatApiError(lookupError)}
        <button type="button" onClick={() => { void activeForPatientQuery.refetch(); if (deviceId) void activeForDeviceQuery.refetch(); }}>Reintentar asignaciones</button>
      </div> : null}
      {partialFailure && (
        <div role="alert" className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900">
          La asignación anterior ya se cerró; la nueva no se pudo crear. La paciente queda sin
          asignación activa. Reintenta con una placa disponible.
        </div>
      )}
      <SelectField
        id="reassign-patient"
        label="Paciente"
        required
        value={patientId}
        onChange={(event) => setPatientId(event.target.value)}
        options={[{ value: '', label: 'Selecciona un paciente…' }, ...catalog.patientOptions]}
      />
      {patientId && (
        <p className="p-3 bg-sky-50 border border-sky-200 rounded-lg text-xs text-sky-800">
          {activeForPatientQuery.isLoading ? (
            'Consultando la asignación activa de la paciente…'
          ) : activeForPatient ? (
            <>
              Se cerrará la asignación activa actual (placa{' '}
              <strong className="font-mono">
                {catalog.deviceCodes.get(activeForPatient.deviceId) ?? activeForPatient.deviceId}
              </strong>
              ) y se creará una nueva. El historial previo del paciente se conserva.
            </>
          ) : (
            'Este paciente no tiene asignación activa; se creará una nueva directamente.'
          )}
        </p>
      )}
      <SelectField
        id="reassign-device"
        label="Nueva placa"
        required
        value={deviceId}
        onChange={(event) => setDeviceId(event.target.value)}
        options={[{ value: '', label: 'Selecciona una placa…' }, ...catalog.deviceOptions]}
      />
      {deviceId && activeForDeviceQuery.isLoading && (
        <p className="text-xs text-slate-500">Consultando la asignación activa de la placa…</p>
      )}
      {deviceOccupiedByOther && deviceActiveAssignment && (
        <div role="alert" className="p-3 bg-rose-50 border border-rose-300 rounded-lg text-xs text-rose-800">
          Esta placa ya tiene una asignación activa con{' '}
          <strong>{catalog.patientNames.get(deviceActiveAssignment.patientId) ?? 'otro paciente'}</strong>
          . Elige otra placa.
        </div>
      )}
      {sameDevice ? <p role="status" className="text-sm text-amber-900">Esta placa ya está asignada al paciente. Selecciona una placa diferente.</p> : null}
    </FormDialog>
  );
};
