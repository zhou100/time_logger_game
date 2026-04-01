/**
 * Two-phase audio upload mutation.
 *
 * Phase 1: POST /v1/entries/presign  → get presigned PUT URL + entry_id
 * Phase 2: PUT to MinIO directly     → audio never transits the app server
 * Phase 3: POST /v1/entries/{id}/submit → enqueue processing job
 *
 * Returns { mutateAsync, isPending, uploadedEntryId }
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { entriesApi } from '../services/api';
import { ENTRIES_KEY } from './useEntries';
import Logger from '../utils/logger';

interface UploadOptions {
    recordedAt?: string;
    localDate?: string;
    durationSeconds?: number;
}

export function useUpload() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({
            blob,
            options,
        }: {
            blob: Blob;
            options?: UploadOptions;
        }) => {
            const contentType = blob.type || 'audio/webm';

            // Phase 1: get presigned URL
            Logger.info('Requesting presign URL');
            const { entry_id, upload_url, audio_key } = await entriesApi.presign(contentType);

            // Phase 2: upload directly to MinIO
            Logger.info(`Uploading audio to storage (${blob.size} bytes)`);
            await entriesApi.uploadToStorage(upload_url, blob);

            // Phase 3: submit for processing
            Logger.info(`Submitting entry ${entry_id} for processing`);
            const { job_id } = await entriesApi.submit(entry_id, audio_key, options);

            Logger.info(`Entry ${entry_id} queued as job ${job_id}`);
            return { entry_id, job_id };
        },
        onSuccess: () => {
            // Invalidate entries list so it refetches once processing completes
            queryClient.invalidateQueries({ queryKey: ENTRIES_KEY });
        },
    });

    return mutation;
}
