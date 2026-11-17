/**
 * Motion kit for education-style videos. Everything is driven by useCurrentFrame().
 *
 *   <AnimatedText text="A **LAN** connects devices in ==one building==" mode="words" />
 *   <Highlight at={20}>key term</Highlight>   <Underline at={20}>…</Underline>   <CircleMark at={20}>…</CircleMark>
 *   <Stagger gap={8}>{items}</Stagger>        <CountUp to={100} suffix=" Mbps" />
 *   <Pulse at={[60]}>…</Pulse>                <Exit at={150}>…</Exit>
 *   <DrawArrow from={{x: 20, y: 50}} to={{x: 70, y: 40}} label="data" />
 *
 * Text markup: **bold**  ==highlight==  __underline__  ((circle))   "\n" = new line
 */
export {AnimatedText, textAnimationSchema, textAnimationTypes, type TextAnimation, type AnimatedTextProps} from './AnimatedText';
export {Highlight, Underline, CircleMark} from './marks';
export {Stagger, CountUp, Pulse, Exit, DrawArrow} from './effects';
export {parseMarkup, stripMarkup, type Segment, type Mark} from './markup';
export {progress, easeOut, easeInOut} from './timing';
export {entrance, entranceSchema, entranceTypes, type Entrance} from '../animation';
