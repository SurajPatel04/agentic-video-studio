import {useEffect, useState, type FC} from 'react';
import type {LucideProps} from 'lucide-react';
import type {IconType} from 'react-icons';
import {useDelayRender} from 'remotion';
import iconNames from '../../../library/react-icons.json';

type Pack = Record<string, unknown>;
const packs: Record<string, () => Promise<Pack>> = {
  ai: () => import('react-icons/ai'),
  bi: () => import('react-icons/bi'),
  bs: () => import('react-icons/bs'),
  cg: () => import('react-icons/cg'),
  ci: () => import('react-icons/ci'),
  di: () => import('react-icons/di'),
  fa: () => import('react-icons/fa'),
  fa6: () => import('react-icons/fa6'),
  fc: () => import('react-icons/fc'),
  fi: () => import('react-icons/fi'),
  gi: () => import('react-icons/gi'),
  go: () => import('react-icons/go'),
  gr: () => import('react-icons/gr'),
  hi: () => import('react-icons/hi'),
  hi2: () => import('react-icons/hi2'),
  im: () => import('react-icons/im'),
  io: () => import('react-icons/io'),
  io5: () => import('react-icons/io5'),
  lia: () => import('react-icons/lia'),
  lu: () => import('react-icons/lu'),
  md: () => import('react-icons/md'),
  pi: () => import('react-icons/pi'),
  ri: () => import('react-icons/ri'),
  rx: () => import('react-icons/rx'),
  si: () => import('react-icons/si'),
  sl: () => import('react-icons/sl'),
  tb: () => import('react-icons/tb'),
  tfi: () => import('react-icons/tfi'),
  ti: () => import('react-icons/ti'),
  vsc: () => import('react-icons/vsc'),
  wi: () => import('react-icons/wi'),
};

const known = new Set(iconNames);
const wrapped = new Map<string, FC<LucideProps>>();
const loaded = new Map<string, IconType>();

/** React Icons references use their pack and exact export name, e.g. react-icons/fa6/FaReact. */
export function reactIconByName(reference: string): FC<LucideProps> | undefined {
  if (!known.has(reference)) return undefined;
  const previous = wrapped.get(reference);
  if (previous) return previous;
  const [, pack, name] = reference.split('/');
  const load = packs[pack];
  if (!load) return undefined;

  const WrappedIcon: FC<LucideProps> = ({width, height, size, strokeWidth: _stroke, absoluteStrokeWidth: _absolute, ...props}) => {
    const [Icon, setIcon] = useState(() => loaded.get(reference));
    const {delayRender, continueRender, cancelRender} = useDelayRender();
    const [handle] = useState(() => Icon ? null : delayRender(`Loading ${reference}`));
    useEffect(() => {
      if (handle === null) return;
      let mounted = true;
      load().then((icons) => {
        const candidate = icons[name];
        if (typeof candidate !== 'function') throw new Error(`Missing React Icons export ${reference}`);
        const Component = candidate as IconType;
        loaded.set(reference, Component);
        if (mounted) setIcon(() => Component);
      }).catch((error) => { if (mounted) cancelRender(error); });
      return () => {
        mounted = false;
        continueRender(handle);
      };
    }, [cancelRender, continueRender, handle]);
    useEffect(() => {
      if (Icon && handle !== null) continueRender(handle);
    }, [Icon, continueRender, handle]);
    return Icon ? <Icon {...props} size={size ?? width ?? height} /> : null;
  };
  wrapped.set(reference, WrappedIcon);
  return WrappedIcon;
}
