import { ImagePlus, Music2, Trash2 } from 'lucide-react'
import { useId } from 'react'
import type { AudioMetadata } from '../features/audio-conversion/types'
import styles from './AudioConvertPage.module.css'

interface AudioMetadataEditorProps {
  itemName: string
  metadata: AudioMetadata
  coverUrl: string | null
  disabled: boolean
  onChange: (field: keyof AudioMetadata, value: string) => void
  onCoverChange: (file: File) => void
  onCoverRemove: () => void
}

const metadataFields: Array<{
  key: Exclude<keyof AudioMetadata, 'comment'>
  label: string
  placeholder: string
  inputMode?: 'numeric'
}> = [
  { key: 'title', label: '歌曲标题', placeholder: '例如：夏日回声' },
  { key: 'artist', label: '艺术家', placeholder: '歌手或创作者' },
  { key: 'album', label: '专辑', placeholder: '专辑名称' },
  { key: 'year', label: '年份', placeholder: '例如：2026', inputMode: 'numeric' },
  { key: 'track', label: '音轨', placeholder: '例如：3/12' },
  { key: 'genre', label: '流派', placeholder: '例如：Pop' },
]

export function AudioMetadataEditor({
  itemName,
  metadata,
  coverUrl,
  disabled,
  onChange,
  onCoverChange,
  onCoverRemove,
}: AudioMetadataEditorProps) {
  const coverInputId = useId()

  return (
    <section className={styles.metadataEditor} aria-label={`${itemName} 的歌曲信息`}>
      <div className={styles.metadataHeading}>
        <div>
          <strong>歌曲配置信息</strong>
          <span>留空的字段会沿用原文件信息；填写内容将覆盖对应标签。</span>
        </div>
      </div>

      <div className={styles.metadataBody}>
        <div className={styles.coverEditor}>
          <div className={styles.coverPreview}>
            {coverUrl ? <img src={coverUrl} alt={`${itemName} 的新封面`} /> : <Music2 aria-hidden="true" />}
          </div>
          <div>
            <strong>歌曲封面</strong>
            <span>支持 JPG、PNG、WebP，建议正方形图片。</span>
            <input
              id={coverInputId}
              type="file"
              aria-label="选择封面图片"
              accept="image/jpeg,image/png,image/webp"
              disabled={disabled}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) onCoverChange(file)
                event.target.value = ''
              }}
            />
            <div className={styles.coverActions}>
              <label htmlFor={coverInputId} aria-disabled={disabled}>
                <ImagePlus aria-hidden="true" /> {coverUrl ? '更换封面' : '添加封面'}
              </label>
              {coverUrl ? (
                <button type="button" onClick={onCoverRemove} disabled={disabled}>
                  <Trash2 aria-hidden="true" /> 移除
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className={styles.metadataFields}>
          {metadataFields.map((field) => (
            <label key={field.key}>
              <span>{field.label}</span>
              <input
                type="text"
                inputMode={field.inputMode}
                value={metadata[field.key]}
                placeholder={field.placeholder}
                disabled={disabled}
                maxLength={field.key === 'year' ? 4 : 120}
                onChange={(event) => onChange(field.key, event.target.value)}
              />
            </label>
          ))}
          <label className={styles.commentField}>
            <span>备注</span>
            <textarea
              value={metadata.comment}
              placeholder="写入歌曲备注信息"
              disabled={disabled}
              maxLength={500}
              rows={2}
              onChange={(event) => onChange('comment', event.target.value)}
            />
          </label>
        </div>
      </div>
    </section>
  )
}
