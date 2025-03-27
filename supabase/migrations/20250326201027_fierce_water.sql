/*
  # Storage policies for image uploads

  1. Security
    - Enable RLS on storage.objects table
    - Add policies for authenticated users to:
      - Upload files to their own directory
      - Read their own files
      - Delete their own files
*/

-- Enable RLS
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Allow users to upload files to their own directory
CREATE POLICY "Users can upload files to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'everything-automotive.com' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to read their own files
CREATE POLICY "Users can view own files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'everything-automotive.com' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own files
CREATE POLICY "Users can delete own files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'everything-automotive.com' AND
  (storage.foldername(name))[1] = auth.uid()::text
);