/**
 * Two-phase audio upload mutation.
 *
 * Privacy model:
 *   The client never sees or handles the raw storage key.
 *   Phase 1 (presign) returns an opaque signed upload_token that encodes the key.
 *   Phase 2 uploads audio directly to storage using the presigned PUT URL.
 *   Phase 3 (submit) echoes the upload_token back — the server verifies it and
 *   recovers the key internally. No forging or substitution is possible.
 *
 * Flow:
 *   POST /v1/entries/presign  → { entry_id, upload_url, upload_token }
 *   PUT  upload_url  (blob)   → audio goes directly to MinIO/R2
 *   POST /v1/entries/{id}/submit { upload_token }  → { entry_id, job_id }
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { entriesApi } from '../services/api';
import { ENTRIES_KEY } from './useEntries';
import Logger from '../utils/logger';

interface UploadOptions {
    recordedAt?: string;
    durationSeconds?: number;
}

export function useUpload() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            blob,
            options,
        }: {
            blob: Blob;
            options?: UploadOptions;
        }) => {
            const contentType = blob.type || 'audio/webm';

            // Phase 1: get presigned PUT URL + signed upload token
            Logger.info('Requesting presign');
            const { entry_id, upload_url, upload_token } = await entriesApi.presign(contentType);

            // Phase 2: upload directly to object storage (app server not involved)
            Logger.info(`Uploading ${blob.size} bytes to storage`);
            await entriesApi.uploadToStorage(upload_url, blob);

            // Phase 3: submit — server verifies upload_token to recover storage key
            Logger.info(`Submitting entry ${entry_id}`);
            const { job_id } = await entriesApi.submit(entry_id, upload_token, options);

            Logger.info(`Entry ${entry_id} queued as job ${job_id}`);
            return { entry_id, job_id };
        },

        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ENTRIES_KEY });
        },
    });
}
