import { AudioLines, FileText, Images, Mic2, Music2, RefreshCw, Rows3, Scissors } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type ToolCategoryId = 'text' | 'image' | 'audio'
export type ToolId = 'replace' | 'notionSplit' | 'pdf' | 'image' | 'audio' | 'audioSplit' | 'audioSubtract' | 'audioMidi' | 'audioVocal'

export const toolCategories: { id: ToolCategoryId; title: string; description: string; icon: LucideIcon }[] = [
  { id: 'text', title: '文本与文档', description: '编辑文字，整理与阅读文档', icon: FileText },
  { id: 'image', title: '图片处理', description: '转换格式，优化图片体积', icon: Images },
  { id: 'audio', title: '音频处理', description: '转换、剪辑与声音处理', icon: Music2 },
]

export interface ToolDefinition {
  id: ToolId
  category: ToolCategoryId
  path: string
  title: string
  detail: string
  description: string
  keywords: string
  icon: LucideIcon
  features: string[]
  audioLabel?: string
}

// Navigation metadata only: importing the catalog must never load a media engine.
export const tools: ToolDefinition[] = [
  {
    id: 'replace', category: 'text', path: '/replace', title: '关键词替换', icon: RefreshCw,
    detail: '查找替换 · 匹配规则', keywords: '文字 文本 搜索 批量 大小写 全字',
    description: '将文本中的指定关键词替换为新的内容，支持多种匹配选项，精准高效。',
    features: ['替换全部或第一个匹配项', '区分大小写 / 全字匹配', '实时预览替换结果', '匹配数量统计'],
  },
  {
    id: 'notionSplit', category: 'text', path: '/notion-split', title: 'Notion 文本切分', icon: Rows3,
    detail: '长文切分 · 逐段复制', keywords: '粘贴上限 字符 字节 段落 笔记',
    description: '将超长文本自动拆分为低于粘贴上限的片段，方便按顺序复制到 Notion。',
    features: ['默认每段最多 2,000 个可见字符', '优先保留段落与句子边界', '每段独立复制与状态反馈', '本机草稿自动保存且不上传'],
  },
  {
    id: 'pdf', category: 'text', path: '/pdf', title: 'PDF 查看', icon: FileText,
    detail: '阅读 · 内容编辑 · 提取', keywords: '文档 翻页 文件 缩略图 目录 书签 密码 文字 TXT PNG 打印 旋转 缩放 编辑 修改 添加 图片 删除',
    description: '在本机阅读、搜索 PDF，修改文字、添加图片并另存为，或提取文字与页面图片。',
    features: ['目录、缩略图与全文搜索', '修改文字、插入图片与另存为', '文字选择与 TXT / PNG 导出', '原文件保留与本地隐私保护'],
  },
  {
    id: 'image', category: 'image', path: '/image-convert', title: '图片转换与压缩', icon: Images,
    detail: '格式转换 · 无损压缩 · 文件夹处理', keywords: 'PNG JPG JPEG WebP BMP ICO TGA DDS GIF AVIF 透明 背景 批量 质量 大小',
    description: '单张或批量转换图片格式、压缩体积并按需控制目标大小，全程本地完成。',
    features: ['PNG / JPG / WebP 转换与压缩', 'ICO / TGA / DDS 格式转换', '无损压缩与文件夹处理', '单图直下与批量 ZIP'],
  },
  {
    id: 'audio', category: 'audio', path: '/audio-convert', title: '音频格式转换', icon: RefreshCw,
    detail: '格式 · 压缩 · 歌曲信息', keywords: '音乐 无损 质量 码率 采样率 标签 封面 艺术家 专辑 MP3 WAV FLAC M4A AAC OGG Opus 批量',
    description: '本地转换音乐格式或无损压缩为 FLAC，支持文件夹批量压缩与歌曲信息编辑。',
    features: ['MP3 / WAV / FLAC / M4A', 'AAC / OGG / Opus 输出', '无损压缩与采样校验', '文件夹批量处理、试听与 ZIP 下载'],
    audioLabel: '转换与压缩',
  },
  {
    id: 'audioSplit', category: 'audio', path: '/audio-split', title: '音频分割与提取', icon: Scissors,
    detail: '剪辑 · 视频音轨 · 左右声道', keywords: '裁剪 截取 片段 分离 立体声 MP4 MOV WebM',
    description: '截取音频片段、提取视频音轨，或将歌曲的左右声道分别导出。',
    features: ['音频与视频文件输入', '毫秒级开始与结束时间', '左右声道独立试听与下载', 'MP3 / WAV 音轨提取'],
    audioLabel: '剪辑与声道',
  },
  {
    id: 'audioSubtract', category: 'audio', path: '/audio-subtract', title: '音频相减', icon: AudioLines,
    detail: '波形对齐 · 保护式消减', keywords: '抵消 消除 同源 A B 减去 音量 对比 极性',
    description: '将 B 的波形从 A 中减去，可自动对齐同源相似波形、校准音量后消减。',
    features: ['严格相减 / 保护模式', '时间、音量与极性校准', '全段音量对比', '本地处理，直接下载 WAV'],
    audioLabel: '音频相减',
  },
  {
    id: 'audioMidi', category: 'audio', path: '/audio-midi', title: '频谱画 MIDI', icon: Music2,
    detail: '手绘音符 · 指定频段去除', keywords: '波谱 钢琴卷帘 转写 音高 频率 编辑',
    description: '以音高频谱为底图画 MIDI，或框选指定时间与频段，去除声音后导出 WAV。',
    features: ['真实音高频谱与钢琴卷帘', '绘制、移动、拉伸音符', '框选频谱去除与对照试听', '导出 MIDI、WAV 与音符工程'],
    audioLabel: '频谱与 MIDI',
  },
  {
    id: 'audioVocal', category: 'audio', path: '/audio-vocal', title: '主唱净化', icon: Mic2,
    detail: '主旋律跟随 · 弱声抑制', keywords: '人声 歌声 和声 底噪 杂音 净化 主唱 主旋律',
    description: '导入已分离的人声，温和压低底噪和弱和声，优先保留主唱音色与咬字。',
    features: ['自然保留与可调抑制强度', '主唱音域与输入声道选择', '20 秒试听与整段净化', '净化与削弱部分对照、WAV 导出'],
    audioLabel: '主唱净化',
  },
]

export function searchTools(query: string): ToolDefinition[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return tools.filter(tool => {
    const category = toolCategories.find(item => item.id === tool.category)!
    const haystack = `${tool.title} ${tool.detail} ${tool.keywords} ${category.title}`.toLocaleLowerCase()
    return terms.every(term => haystack.includes(term))
  })
}
